"""Conv1D CNN nowcaster -- detects an ongoing/just-started flare.

Input  : ``(B, C, L)`` -- feature channels x window length.
Output : ``(B, 1)`` sigmoid probability that the current window is flaring.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class Nowcaster(nn.Module):
    """Binary flare nowcast from a short flux window (Conv1D CNN)."""

    def __init__(self, n_channels: int = 5, hidden: int = 64, kernel: int = 5) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(n_channels, hidden, kernel, padding=kernel // 2)
        self.conv2 = nn.Conv1d(hidden, hidden, kernel, padding=kernel // 2)
        self.pool = nn.AdaptiveAvgPool1d(1)
        self.fc = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.conv1(x))
        x = torch.relu(self.conv2(x))
        x = self.pool(x).squeeze(-1)
        return torch.sigmoid(self.fc(x))


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
