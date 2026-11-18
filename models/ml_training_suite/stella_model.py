"""STELLA neural networks: Conv1D nowcaster and TCN forecaster (PyTorch).

Input tensors are (batch, 11, L) with time as the last axis; the prediction is made from the
LAST time step, which only sees past samples (all convolutions are causal).
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn.utils.parametrizations import weight_norm


class CausalConv1d(nn.Module):
    """Conv1d with left-only zero padding so output[t] depends on input[<= t]."""

    def __init__(self, c_in, c_out, kernel_size=3, dilation=1, use_weight_norm=True):
        super().__init__()
        self.pad = (kernel_size - 1) * dilation
        conv = nn.Conv1d(c_in, c_out, kernel_size, dilation=dilation)
        self.conv = weight_norm(conv) if use_weight_norm else conv

    def forward(self, x):
        return self.conv(F.pad(x, (self.pad, 0)))


class Conv1DNowcaster(nn.Module):
    """Four causal Conv1D layers (k=3, dilations 1,2,4,8). Outputs P(>=C), P(>=M) with P(>=M) <= P(>=C).
    Receptive field = 1 + (k-1) * sum(dilations) = 31 samples with the defaults."""

    def __init__(self, in_channels=11, hidden=64, kernel_size=3, dilations=(1, 2, 4, 8), dropout=0.1):
        super().__init__()
        self.dilations = tuple(dilations)
        layers, c = [], in_channels
        for d in self.dilations:
            layers += [CausalConv1d(c, hidden, kernel_size, d), nn.ReLU(), nn.Dropout(dropout)]
            c = hidden
        self.net = nn.Sequential(*layers)
        self.head = nn.Linear(hidden, 2)
        self.receptive_field = 1 + (kernel_size - 1) * sum(self.dilations)

    def forward(self, x):
        h = self.net(x)[:, :, -1]
        z = self.head(h)  # z_C, z_M
        logp_c = F.logsigmoid(z[:, 0])
        logp_m = logp_c + F.logsigmoid(z[:, 1])  # p_M = p_C * sigmoid(z_M)  <=  p_C
        log_probs = torch.stack([logp_c, logp_m], dim=1)
        return {"logits": z, "log_probs": log_probs, "probs": log_probs.exp()}


class TCNBlock(nn.Module):
    """Residual block with two causal dilated convolutions."""

    def __init__(self, c_in, c_out, kernel_size, dilation, dropout):
        super().__init__()
        self.conv1 = CausalConv1d(c_in, c_out, kernel_size, dilation)
        self.conv2 = CausalConv1d(c_out, c_out, kernel_size, dilation)
        self.drop = nn.Dropout(dropout)
        self.res = nn.Conv1d(c_in, c_out, 1) if c_in != c_out else nn.Identity()

    def forward(self, x):
        h = self.drop(F.relu(self.conv1(x)))
        h = self.drop(F.relu(self.conv2(h)))
        return F.relu(h + self.res(x))


class TCNForecaster(nn.Module):
    """Six residual TCN blocks (k=3, dilations 1,2,4,8,16,32).

    Receptive field = 1 + 2*(k-1)*sum(dilations) = 253 samples with the defaults. The context
    length fed to the model is chosen in the data config (e.g. 180 or 253 minutes); shorter
    inputs are implicitly zero-padded on the left by the causal convolutions.

    Outputs: nested probabilities P(>=B), P(>=C), P(>=M), P(>=X) and expected lead time (0, max_lead] min.
    """

    def __init__(self, in_channels=11, hidden=64, kernel_size=3, dilations=(1, 2, 4, 8, 16, 32),
                 dropout=0.1, max_lead_minutes=60.0):
        super().__init__()
        self.dilations = tuple(dilations)
        self.max_lead = float(max_lead_minutes)
        blocks, c = [], in_channels
        for d in self.dilations:
            blocks.append(TCNBlock(c, hidden, kernel_size, d, dropout))
            c = hidden
        self.blocks = nn.Sequential(*blocks)
        self.head = nn.Sequential(nn.Linear(hidden, hidden), nn.ReLU(), nn.Linear(hidden, 5))
        self.receptive_field = 1 + 2 * (kernel_size - 1) * sum(self.dilations)

    def forward(self, x):
        h = self.blocks(x)[:, :, -1]
        o = self.head(h)
        z = o[:, :4]  # z_B, z_C, z_M, z_X
        ls = F.logsigmoid(z)
        log_probs = torch.cumsum(ls, dim=1)  # log p_B, log p_B+log s_C, ... (nested product)
        lead = self.max_lead * torch.sigmoid(o[:, 4])  # in (0, max_lead)
        return {"logits": z, "log_probs": log_probs, "probs": log_probs.exp(), "lead": lead}


def build_model(kind: str, args: dict) -> nn.Module:
    args = dict(args)
    if kind == "nowcaster":
        return Conv1DNowcaster(**args)
    if kind == "forecaster":
        return TCNForecaster(**args)
    raise ValueError(f"unknown model kind: {kind}")


# ----------------------------------------------------------------------------- losses
def log1mexp(x: torch.Tensor) -> torch.Tensor:
    """Numerically stable log(1 - exp(x)) for x < 0."""
    x = x.clamp(max=-1e-7)
    return torch.where(x > -0.6931471805599453, torch.log(-torch.expm1(x)), torch.log1p(-torch.exp(x)))


def nested_bce(log_probs, y, weight=None, pos_weight=None):
    """Binary cross-entropy on (nested) probabilities given as log-probabilities.
    Returns one loss per head, shape (K,). `weight` (B,K) masks/weights samples."""
    pw = 1.0 if pos_weight is None else pos_weight.to(log_probs.device).view(1, -1)
    loss = -(pw * y * log_probs + (1.0 - y) * log1mexp(log_probs))
    if weight is None:
        return loss.mean(dim=0)
    return (loss * weight).sum(dim=0) / weight.sum(dim=0).clamp(min=1e-8)


def lead_huber_loss(pred_lead, true_lead, valid, scale, delta=0.1):
    """Huber loss on lead time (scaled by `scale` minutes), averaged over valid samples only."""
    h = F.huber_loss(pred_lead / scale, true_lead / scale, delta=delta, reduction="none")
    return (h * valid).sum() / valid.sum().clamp(min=1.0)


# ----------------------------------------------------------------------------- checkpoints
def save_checkpoint(path, kind, model, model_args, normalizer_dict, config, epoch, metrics,
                    context_steps, cadence_minutes, feature_names, seed):
    torch.save(
        {
            "kind": kind,
            "model_state": model.state_dict(),
            "model_args": dict(model_args),
            "normalizer": normalizer_dict,
            "config": config,
            "epoch": int(epoch),
            "val_metrics": {k: (None if v is None else float(v)) for k, v in metrics.items()},
            "context_steps": int(context_steps),
            "cadence_minutes": float(cadence_minutes),
            "feature_names": list(feature_names),
            "seed": int(seed),
            "torch_version": torch.__version__,
        },
        path,
    )


def load_checkpoint(path, device="cpu"):
    """Returns (model in eval mode, checkpoint dict)."""
    ckpt = torch.load(path, map_location=device, weights_only=True)
    model = build_model(ckpt["kind"], ckpt["model_args"]).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model, ckpt
