"""Print the live operator briefing from a running STELLA API.

A tiny, dependency-free console client for the ``/api/ops/briefing`` endpoint,
handy for quick situational checks or ops scripts.

Usage:

    python scripts/ops_briefing.py
    python scripts/ops_briefing.py --base-url http://127.0.0.1:8000 --json
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def fetch(base_url: str, path: str, timeout: float = 5.0) -> dict:
    """Fetch and decode a JSON document from the API."""
    url = f"{base_url.rstrip('/')}{path}"
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def render(briefing: dict) -> str:
    """Format a briefing payload as a short human-readable block."""
    if briefing.get("status") != "ok":
        return f"[{briefing.get('status', 'unknown')}] {briefing.get('headline', '')}"
    nowcast = briefing.get("nowcast", {})
    forecast = briefing.get("forecast", {})
    return "\n".join(
        [
            f"STELLA :: {briefing.get('headline')}",
            f"  solar state : {briefing.get('solarState')} ({briefing.get('stateLabel')})",
            f"  nowcast     : {nowcast.get('flareClass')} @ {nowcast.get('confidence')}",
            f"  forecast    : {forecast.get('probability')}% {forecast.get('nextClass')} "
            f"({forecast.get('leadMinutes')} min lead)",
            f"  alerts      : {briefing.get('activeAlerts')}",
            f"  data source : {briefing.get('dataSource')}",
        ]
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--json", action="store_true", help="emit the raw payload")
    args = parser.parse_args(argv)

    try:
        briefing = fetch(args.base_url, "/api/ops/briefing")
    except (urllib.error.URLError, OSError) as exc:
        print(f"could not reach the STELLA API at {args.base_url}: {exc}")
        return 1

    print(json.dumps(briefing, indent=2) if args.json else render(briefing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
