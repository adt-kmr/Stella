"""Dilated temporal convolutional network (TCN) forecaster.

Forecasts P(flare within lead window) + expected lead time from a longer
context window. Causal dilated convolutions (Bai et al., 2018) give long
receptive fields at low parameter count -- well suited to 3-hour flux context.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class CausalConv1d(nn.Module):
    """Conv1d that does not look ahead: padding is trimmed on the right."""

    def __init__(self, in_ch: int, out_ch: int, kernel: int, dilation: int = 1) -> None:
        super().__init__()
        pad = (kernel - 1) * dilation
        self.conv = nn.Conv1d(in_ch, out_ch, kernel, dilation=dilation, padding=pad)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)[..., : x.size(-1)]


class TemporalBlock(nn.Module):
    """Residual block: two causal dilated convs + ReLU + dropout."""

    def __init__(
        self, in_ch: int, out_ch: int, kernel: int, dilation: int, dropout: float = 0.1
    ) -> None:
        super().__init__()
        self.block = nn.Sequential(
            CausalConv1d(in_ch, out_ch, kernel, dilation),
            nn.ReLU(),
            nn.Dropout(dropout),
            CausalConv1d(out_ch, out_ch, kernel, dilation),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.residual = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.relu(self.block(x) + self.residual(x))


class Forecaster(nn.Module):
    """TCN returning (P(flare), expected lead time) from the final timestep."""

    def __init__(
        self,
        n_channels: int = 5,
        channels: tuple[int, ...] = (32, 32, 64),
        kernel: int = 5,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.stem = nn.Conv1d(n_channels, channels[0], 1)
        blocks: list[nn.Module] = []
        for i, out_ch in enumerate(channels):
            blocks.append(
                TemporalBlock(channels[i - 1] if i else channels[0], out_ch, kernel, 2**i, dropout)
            )
        self.tcn = nn.Sequential(*blocks)
        self.head = nn.Conv1d(channels[-1], 2, 1)  # (p, lead) at final step

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.stem(x))
        x = self.tcn(x)
        out = self.head(x)[..., -1:]
        prob = torch.sigmoid(out[:, :1])
        lead = torch.relu(out[:, 1:])
        return torch.cat([prob, lead], dim=-1)
