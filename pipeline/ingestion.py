"""Aditya-L1 (SoLEXS / HEL1OS) telemetry loading helpers.

``api.main`` expects a lightweight loader that returns a list of per-sample
dictionaries. The real PRADAN Level-1 products are not public yet, so this
module scans ``data/raw/aditya_l1/`` for CSV drops and returns an empty list
when none are present -- keeping the dashboard startup path fluent offline.
"""

from __future__ import annotations

import csv
import logging
from pathlib import Path

logger = logging.getLogger("stella.ingestion")

RAW_DIR = Path("data") / "raw" / "aditya_l1"

REQUIRED_COLUMNS = ("time", "soft_flux", "hard_25_50")


def _coerce_row(row: dict) -> dict | None:
    """Normalise one CSV row into the internal Aditya-L1 sample shape."""
    try:
        return {
            "time": float(row["time"]),
            "soft_flux": float(row["soft_flux"]),
            "hard_25_50": float(row["hard_25_50"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def load_aditya_data(sample_every: int = 30, raw_dir: str | Path | None = None) -> list[dict]:
    """Return sampled Aditya-L1 rows, or ``[]`` when no telemetry is staged."""
    base = Path(raw_dir) if raw_dir else RAW_DIR
    if not base.exists():
        return []

    rows: list[dict] = []
    for csv_path in sorted(base.glob("*.csv")):
        try:
            with csv_path.open("r", encoding="utf-8", newline="") as fh:
                for raw in csv.DictReader(fh):
                    parsed = _coerce_row(raw)
                    if parsed is not None:
                        rows.append(parsed)
        except OSError as exc:  # pragma: no cover - defensive
            logger.warning("skipping %s: %s", csv_path, exc)

    rows.sort(key=lambda r: r["time"])
    step = max(1, int(sample_every))
    return rows[::step]
