"""Telemetry and catalog loaders for NOAA GOES and Aditya-L1 data.

Everything degrades gracefully: if a source file is missing, loaders return
an empty frame with the correct schema so downstream stages can be tested
without network access.
"""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

CATALOG_COLUMNS = ["start_time", "peak_time", "end_time", "class_label", "source"]
FLUX_COLUMNS = ["timestamp", "soft_x_ray", "hard_x_ray"]


def load_flare_catalog(path: str | Path | None = None) -> pd.DataFrame:
    """Load the historical flare catalog into a normalised frame.

    Source files may be a CSV written by :func:`download_data` or a raw
    NOAA ISES text table; both end up with ``CATALOG_COLUMNS``.
    """
    p = Path(path) if path else Path("data") / "processed" / "flare_catalog.csv"
    if not p.exists():
        return pd.DataFrame(columns=CATALOG_COLUMNS)
    df = pd.read_csv(p)
    for col in CATALOG_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
    df["start_time"] = pd.to_datetime(df["start_time"], errors="coerce")
    df["peak_time"] = pd.to_datetime(df["peak_time"], errors="coerce")
    df["end_time"] = pd.to_datetime(df["end_time"], errors="coerce")
    return df[CATALOG_COLUMNS]


def load_flux_frame(path: str | Path | None = None) -> pd.DataFrame:
    """Load a soft/hard X-ray flux frame (``FLUX_COLUMNS``)."""
    p = Path(path) if path else Path("data") / "processed" / "flux.csv"
    if not p.exists():
        return pd.DataFrame(columns=FLUX_COLUMNS)
    df = pd.read_csv(p)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    return df[FLUX_COLUMNS]


def resample_to_seconds(df: pd.DataFrame, freq: str = "s") -> pd.DataFrame:
    """Resample a flux frame to a regular cadence, forward-filled."""
    if df.empty:
        return df
    df = df.set_index("timestamp").sort_index()
    return df.resample(freq).mean().ffill().reset_index()


def goes_event_list_to_frame(events: list[dict]) -> pd.DataFrame:
    """Convert NOAA GOES JSON flare-list records into a catalog frame."""
    rows = []
    for ev in events:
        rows.append(
            {
                "start_time": _parse(ev.get("begin_time")),
                "peak_time": _parse(ev.get("peak_time")),
                "end_time": _parse(ev.get("end_time")),
                "class_label": ev.get("class", "M1.0"),
                "source": "noaa_goes",
            }
        )
    return pd.DataFrame(rows, columns=CATALOG_COLUMNS)


def _parse(value: str | None) -> datetime | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        return pd.to_datetime(value)
    except (ValueError, TypeError):
        return None


RAW_DIR = Path("data") / "raw" / "aditya_l1"

REQUIRED_COLUMNS = ("time", "soft_flux", "hard_25_50")


def _coerce_row(row: dict) -> dict | None:
    """Normalise one Aditya-L1 CSV row into the internal sample shape."""
    try:
        return {
            "time": float(row["time"]),
            "soft_flux": float(row["soft_flux"]),
            "hard_25_50": float(row["hard_25_50"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def load_aditya_data(sample_every: int = 30, raw_dir: str | Path | None = None) -> list[dict]:
    """Return sampled Aditya-L1 rows, or ``[]`` when no telemetry is staged.

    Scans ``data/raw/aditya_l1/`` for CSV drops (PRADAN Level-1 products are
    not public yet) and returns an empty list when none are present, keeping
    the dashboard startup path fluent offline.
    """
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
            print(f"skipping {csv_path}: {exc}")

    rows.sort(key=lambda r: r["time"])
    step = max(1, int(sample_every))
    return rows[::step]
