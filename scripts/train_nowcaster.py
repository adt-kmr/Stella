"""Train the Conv1D nowcaster on synthetic + real feature windows.

Operational training would consume processed Aditya-L1 / GOES windows; for
model development this script also works end-to-end on deterministic
synthetic flare bursts so the full loop is exercised before real data lands.

Usage:

    python scripts/train_nowcaster.py --epochs 20 --out models/nowcaster.pt
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from pipeline.features import build_feature_frame
from pipeline.models.nowcaster import Nowcaster

ROOT = Path(__file__).resolve().parents[1]


def synthetic_batch(n: int, seq_len: int, seed: int = 0) -> tuple[torch.Tensor, torch.Tensor]:
    """Generate (features, flare-label) pairs: quiet noise vs impulsive flare."""
    rng = np.random.default_rng(seed)
    xs, ys = [], []
    for _ in range(n):
        flaring = rng.random() < 0.5
        soft = np.full(seq_len, -6.5 + rng.normal(0, 0.02))  # log10 flux quiet C-level
        hard = np.full(seq_len, -7.5 + rng.normal(0, 0.02))
        if flaring:
            rise = int(seq_len * 0.6)
            impulse = np.array([0.0, 0.02, 0.05, 0.12, 0.3, 0.55, 0.85, 1.0])
            for j, w in enumerate(impulse):
                idx = rise + j
                if idx < seq_len:
                    soft[idx] += 0.08 * w
                    hard[idx] += 0.35 * w  # HEL1OS leads: harder, earlier jump
        feats = build_feature_frame(np.power(10, soft), np.power(10, hard))
        xs.append(feats)
        ys.append(1.0 if flaring else 0.0)
    return torch.from_numpy(np.stack(xs).transpose(0, 2, 1)).float(), torch.tensor(ys).unsqueeze(-1)


def train(
    epochs: int,
    batch_size: int,
    n_batches: int,
    seq_len: int,
    lr: float,
    out: Path,
    seed: int,
) -> Nowcaster:
    torch.manual_seed(seed)
    model = Nowcaster(n_channels=5)
    optim = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.BCEWithLogitsLoss() if False else nn.BCELoss()
    for epoch in range(epochs):
        total = 0.0
        for _ in range(n_batches):
            x, y = synthetic_batch(batch_size, seq_len, seed + epoch)
            loss = criterion(model(x), y)
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
    parser.add_argument("--seq-len", type=int, default=30)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=Path, default=ROOT / "models" / "nowcaster.pt")
    args = parser.parse_args()
    train(args.epochs, args.batch_size, args.n_batches, args.seq_len, args.lr, args.out, args.seed)
