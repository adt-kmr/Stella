"""Operator-facing digests for the live mission-control pipeline.

Pure, dependency-free builders: given the in-memory snapshot held by the API
store, they produce the compact briefing and runtime summaries exposed by the
operations endpoints. Keeping this logic out of the route handlers makes it
directly unit-testable without spinning up an app.
"""

from __future__ import annotations

from datetime import datetime, timezone


def _headline(state: str, flare: str, probability: int, lead: int) -> str:
    """One-line situation summary chosen from the current solar state."""
    if state == "ACTIVE":
        return f"{flare} flare in progress — impact window {lead} min"
    if state == "WATCH":
        return f"Elevated activity — {probability}% chance, {lead} min lead"
    return "Quiet Sun — no significant activity"


def build_briefing(snapshot: dict | None) -> dict:
    """Compact, single-glance digest of the current solar situation."""
    generated = datetime.now(timezone.utc).isoformat()
    if not snapshot:
        return {
            "status": "no_data",
            "headline": "No live pipeline snapshot available yet",
            "generatedAt": generated,
        }

    system = snapshot.get("systemStatus", {})
    nowcast = snapshot.get("nowcast", {})
    forecast = snapshot.get("forecast", {})
    ratio = snapshot.get("hardnessRatio", {})
    alerts = snapshot.get("alerts") or []

    state = str(system.get("state", "QUIET"))
    flare = nowcast.get("class") or "—"
    probability = int(forecast.get("probability") or 0)
    lead = int(forecast.get("leadTime") or 0)

    return {
        "status": "ok",
        "headline": _headline(state, flare, probability, lead),
        "solarState": state,
        "stateLabel": system.get("stateLabel", "Quiet Sun"),
        "modelVersion": system.get("modelVersion"),
        "dataSource": snapshot.get("dataSource", "unknown"),
        "nowcast": {
            "flareClass": flare,
            "phase": nowcast.get("currentPhase"),
            "confidence": round(float(nowcast.get("confidence") or 0.0), 3),
        },
        "forecast": {
            "probability": probability,
            "nextClass": forecast.get("nextClass"),
            "leadMinutes": lead,
        },
        "hardness": {
            "ratio": ratio.get("current"),
            "preFlareSignal": bool(ratio.get("preFlareSignal", False)),
        },
        "activeAlerts": len(alerts),
        "generatedAt": generated,
    }


def build_runtime(
    snapshot: dict | None,
    *,
    uptime_seconds: float,
    buffered_points: int,
    buffered_alerts: int,
) -> dict:
    """Process/runtime health summary for operators."""
    system = (snapshot or {}).get("systemStatus", {})
    return {
        "uptimeSeconds": round(float(uptime_seconds), 1),
        "bufferedPoints": int(buffered_points),
        "bufferedAlerts": int(buffered_alerts),
        "lastSync": system.get("lastSync"),
        "dataLatency": system.get("dataLatency"),
        "pipeline": system.get("pipeline", "Unknown"),
    }
