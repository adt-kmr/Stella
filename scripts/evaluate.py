"""Evaluate detection quality: POD / FAR / CSI / lead time on a run.

Reads a predictions CSV (``timestamp, predicted, observed, risk``) and
prints/writes the event-scores table that feeds ``/api/metrics``.

Usage:

    python scripts/evaluate.py --predictions results/predictions.csv \
        --out models/results.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from pipeline.evaluation import score_run

ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "models" / "results.json")
    parser.add_argument("--save", action="store_true", help="also write M/X stratified rows")
    args = parser.parse_args(argv)

    df = pd.read_csv(args.predictions)
    pred = df["predicted"].astype(float) >= 0.5
    obs = df["observed"].astype(bool)

    scores = score_run(
        pred.to_numpy(),
        obs.to_numpy(),
        df["alert_times"].to_numpy() if "alert_times" in df else None,
        df["event_times"].to_numpy() if "event_times" in df else None,
    )
    summary = {
        "model": "helios-cortex-cascade",
        "rows": [
            {"metric": "POD", "value": round(scores.pod, 3)},
            {"metric": "FAR", "value": round(scores.far, 3)},
            {"metric": "CSI", "value": round(scores.csi, 3)},
            {"metric": "Lead Time (min)", "value": round(scores.mean_lead_minutes, 1)},
        ],
        "contingency": scores.contingency.__dict__,
    }
    if args.save:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"written -> {args.out}")
    else:
        print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
