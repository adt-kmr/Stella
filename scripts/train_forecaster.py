"""Train the dilated-TCN forecaster on context windows -> (P, lead).

Forecast objective: predict P(flare within lead window) and expected lead
minutes from a longer flux context. Same synthetic-loop approach as the
nowcaster trainer until real windows are processed.

Usage:

    python scripts/train_forecaster.py --epochs 20 --out models/forecaster.pt
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from pipeline.models.forecaster import Forecaster

ROOT = Path(__file__).resolve().parents[1]


def synthetic_context(
    n: int, ctx_len: int, seed: int = 0
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Return (features, prob, lead) triples for TCN training."""
    rng = np.random.default_rng(seed)
    xs, probs, leads = [], [], []
    for _ in range(n):
        tc = ctx_len // 4
        quiet = np.full((5, ctx_len), 0.0)
        for c in range(5):
            quiet[c] = rng.normal(0, 0.05, ctx_len)
        flare = rng.random() < 0.5
        prob = 0.9 if flare else 0.05
        lead = float(rng.integers(15, 60)) if flare else 0.0
        if flare:
            on = tc + int(rng.integers(0, tc))
            span = min(10, ctx_len - on)
            quiet[0, on - tc : on] += np.linspace(0, 0.5, tc)  # soft rises late
            quiet[1, on - 2 * tc : on] += np.linspace(0, 1.2, 2 * tc)  # hard leads
            quiet[0, on : on + span] += 0.9
        xs.append(quiet)
        probs.append(prob)
        leads.append(lead)
    return (
        torch.from_numpy(np.stack(xs)).float(),
        torch.tensor(probs).unsqueeze(-1),
        torch.tensor(leads).unsqueeze(-1),
    )


def train(
    epochs: int,
    batch_size: int,
    n_batches: int,
    ctx_len: int,
    lr: float,
    out: Path,
    seed: int,
) -> Forecaster:
    torch.manual_seed(seed)
    model = Forecaster(n_channels=5)
    optim = torch.optim.Adam(model.parameters(), lr=lr)
    bce = nn.BCELoss()
    mse = nn.MSELoss()
    for epoch in range(epochs):
        total = 0.0
        for b in range(n_batches):
            x, p, lead = synthetic_context(batch_size, ctx_len, seed + epoch * n_batches + b)
            out_t = model(x)
            loss = bce(out_t[..., 0], p) + 0.1 * mse(out_t[..., 1], lead / 60.0)
            optim.zero_grad()
            loss.backward()
            optim.step()
            total += float(loss)
        print(f"epoch {epoch + 1:02d}/{epochs}  loss={total / n_batches:.4f}")
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), out)
    print(f"saved -> {out}")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--n-batches", type=int, default=16)
    parser.add_argument("--ctx-len", type=int, default=180)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=Path, default=ROOT / "models" / "forecaster.pt")
    args = parser.parse_args()
    train(args.epochs, args.batch_size, args.n_batches, args.ctx_len, args.lr, args.out, args.seed)
