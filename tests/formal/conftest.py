"""Shared fixtures for the six formal end-semester test cases (T_01 - T_06).

The tests in this package implement the test cases recorded in the project
file (Section 5.2) and are executed with the authors, executors and dates
listed in Section 5.3.  Everything here is deterministic and offline: the
satellite feed is represented by the in-memory telemetry store and by the
recorded/replay sources shipped with the prototype.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient

import api.main as main


@pytest.fixture(scope="module")
def client():
    """Test client whose startup hook seeds telemetry as in production."""
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def restore_state():
    """Snapshot/restore the monolith's in-memory state around a mutating test.

    The REST app keeps ``_latest_status``, ``_timeseries_history`` and
    ``_alerts_history`` at module level.  Restoring them keeps the formal
    cases independent of each other and of the existing contract tests.
    """
    # /api/update appends to these lists in place, so snapshot copies.
    saved = (
        deepcopy(main._latest_status),
        list(main._timeseries_history),
        list(main._alerts_history),
    )
    yield
    main._latest_status, main._timeseries_history, main._alerts_history = saved
    main._mirror_to_store()


def _status(state: str = "QUIET", *, flare_class: str = "B1.0", alerts=None) -> dict:
    """Build a complete ``UnifiedStatusModel``-shaped status payload."""
    ts = datetime.utcnow().isoformat() + "Z"
    alert_list = [] if alerts is None else alerts
    active = state == "ACTIVE"
    return {
        "systemStatus": {
            "state": state,
            "stateLabel": {"QUIET": "Quiet Sun", "WATCH": "Elevated Hardness", "ACTIVE": "Active Flare"}[state],
            "stateColor": {"QUIET": "#2ECC71", "WATCH": "#F1C40F", "ACTIVE": "#E74C3C"}[state],
            "since": ts,
            "pipeline": "Operational",
            "dataLatency": "1.2s",
            "lastSync": ts,
            "pradanSync": "Healthy",
            "al1Sync": "Healthy",
            "modelVersion": "v2.1.3",
        },
        "nowcast": {
            "class": flare_class if active else "—",
            "peakFlux": 2.3e-5 if active else 5.2e-8,
            "onset": ts if active else "—",
            "peakTime": ts if active else "—",
            "currentPhase": "Impulsive Onset" if active else "Quiet Sun",
            "adaptiveThreshold": 3.0,
            "rollingMAD": 2.8e-8,
            "zScore": 4.5 if active else 0.1,
            "confidence": 0.95 if active else 0.98,
        },
        "forecast": {
            "probability": 92 if active else 12,
            "updatedAt": ts,
            "windowStart": ts,
            "windowEnd": ts,
            "nextClass": "M-class" if active else "C-class",
            "leadTime": 38 if active else 0,
            "tcnConfidence": 0.92 if active else 0.12,
        },
        "hardnessRatio": {
            "current": 0.085 if active else 0.035,
            "baseline": 0.035,
            "threshold": 0.06,
            "trend": "rising" if active else "stable",
            "preFlareSignal": active,
            "minutesEarly": 38 if active else 0,
        },
        "alerts": alert_list,
        "flareClass": flare_class,
    }


@pytest.fixture
def tick_factory():
    """Factory for a valid ``POST /api/update`` telemetry tick."""

    def build(
        *,
        minutes_ago: float = 1.0,
        state: str = "QUIET",
        flare_class: str = "B1.0",
        alerts=None,
        soft: float = 1e-6,
        hard: float = 7.5,
        hr: float = 0.035,
    ) -> dict:
        stamp = datetime.utcnow() - timedelta(minutes=minutes_ago)
        return {
            "timestamp_utc": stamp.isoformat() + "Z",
            "telemetry": {"soft_flux": soft, "hard_25_50": hard},
            "features": [0.0, 0.0, hr],
            "status": _status(state, flare_class=flare_class, alerts=alerts),
        }

    return build


@pytest.fixture
def flare_windows():
    """Reference windows: hard X-rays lead soft X-rays (Neupert effect)."""
    soft = np.full(120, 1e-7)
    hard = np.full(120, 1e-9)
    soft[60:68] = 2e-4  # thermal rise / X-class magnitude
    hard[56:64] = 1e-5  # non-thermal onset four samples earlier
    return soft, hard


@pytest.fixture
def quiet_windows():
    """Reference quiet-Sun windows with small, bounded background jitter."""
    rng = np.random.default_rng(42)
    soft = 1e-7 * (1 + 0.05 * rng.standard_normal(120))
    hard = 1e-9 * (1 + 0.05 * rng.standard_normal(120))
    return soft, hard


@pytest.fixture
def warning_alert():
    """A high-risk alert record as emitted by the alert engine."""
    return deepcopy(
        {
            "ts": datetime.utcnow().isoformat() + "Z",
            "type": "ALERT",
            "level": "RED",
            "msg": "X-class flare in progress — modelled high infrastructure risk",
            "Class": "X2.7",
            "prob": 92,
            "hr": 0.085,
        }
    )
