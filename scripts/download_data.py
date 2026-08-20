"""Download NOAA GOES flare/telemetry data into ``data/raw``.

Aditya-L1 (SoLEXS/HEL1OS) science data is not yet open to the public, so
that stage stages a placeholder and instructs where to drop real telemetry
once released. The GOES-side provides the 28+ years of pre-training data
the transfer-learning stage consumes.

Usage:

    python scripts/download_data.py                # GOES + create structure
    python scripts/download_data.py --skip-goes    # Aditya-L1 staging only

Requires network access. Everything is written under data/raw.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

GOES_DAILY_JSON = "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json"
GOES_1M_FLUX = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"

API_KEYS = ("SOLEXS", "HEL1OS")


def _mkdirs() -> None:
    for p in (RAW, PROCESSED, RAW / "goes", RAW / "aditya_l1"):
        p.mkdir(parents=True, exist_ok=True)


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "stella/0.1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def download_goes() -> list[dict]:
    """Download the latest GOES flare list + hourly flux snapshot."""
    events = json.loads(_fetch(GOES_DAILY_JSON))
    (RAW / "goes" / "xray-flares-latest.json").write_bytes(_fetch(GOES_DAILY_JSON))
    flux = json.loads(_fetch(GOES_1M_FLUX))
    (RAW / "goes" / "xrays-6-hour.json").write_text(json.dumps(flux, indent=2), encoding="utf-8")
    print(f"downloaded {len(events)} flares, {len(flux)} flux frames -> data/raw/goes/")
    return events


def stage_aditya_l1_placeholder() -> None:
    """Create the Aditya-L1 telemetry staging directory with a README."""
    stage = RAW / "aditya_l1"
    readme = stage / "README.md"
    if not readme.exists():
        readme.write_text(
            "# Aditya-L1 telemetry staging\n\n"
            "Drop SoLEXS (soft X-ray) and HEL1OS (hard X-ray) time-resolved "
            "flux CSVs here once the science data becomes public.\n\n"
            "Expected naming: `solexs.csv` (timestamp, flux), `hel1os.csv` "
            "(timestamp, flux). The loader in `pipeline/ingest.py` consumes "
            "these directly.\n",
            encoding="utf-8",
        )
    print("staged Aditya-L1 telemetry slot -> data/raw/aditya_l1/ (placeholder)")


def export_catalog(events: list[dict]) -> None:
    if not events:
        return
    from pipeline.ingest import goes_event_list_to_frame

    frame = goes_event_list_to_frame(events)
    out = PROCESSED / "flare_catalog.csv"
    frame.to_csv(out, index=False)
    print(f"exported normalized catalog -> {out.relative_to(ROOT)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-goes", action="store_true", help="only stage Aditya-L1")
    args = parser.parse_args(argv)
    _mkdirs()
    if not args.skip_goes:
        try:
            events = download_goes()
        except urllib.error.URLError as exc:
            print(f"GOES download failed (offline?): {exc}", file=sys.stderr)
            events = []
        export_catalog(events)
    else:
        print("skipped GOES download")
    stage_aditya_l1_placeholder()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
