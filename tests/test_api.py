"""API contract tests for the live mission-control endpoints.

These exercise the camelCase REST surface that the React dashboard consumes
(``/api/status``, ``/api/timeseries``, ``/api/impact`` ...). The client is
entered as a context manager so the app's startup hook pre-populates the
in-memory telemetry exactly as it does in production.
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_status_reports_unified_state(client):
    r = client.get("/api/status")
    assert r.status_code == 200
    body = r.json()
    assert {"systemStatus", "nowcast", "forecast", "hardnessRatio"} <= body.keys()
    assert body["systemStatus"]["state"] in ("QUIET", "WATCH", "ACTIVE")


def test_timeseries_is_ordered_point_list(client):
    r = client.get("/api/timeseries?hours=6")
    assert r.status_code == 200
    points = r.json()
    assert isinstance(points, list)
    if points:
        assert {"timestamp", "softFlux", "hardFlux", "hardnessRatio"} <= points[0].keys()
        stamps = [p["timestamp"] for p in points]
        assert stamps == sorted(stamps)


def test_alerts_endpoint_returns_list(client):
    r = client.get("/api/alerts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_catalog_endpoint_lists_events(client):
    r = client.get("/api/catalog")
    assert r.status_code == 200
    events = r.json()
    assert len(events) == 6
    assert {"cls", "peak", "lead", "conf"} <= events[0].keys()


def test_impact_endpoint_schema(client):
    r = client.get("/api/impact?flare_class=M3.5")
    assert r.status_code == 200
    body = r.json()
    assert body["flareClass"] == "M3.5"
    assert isinstance(body["categories"], list)
    assert len(body["categories"]) >= 4


def test_india_impact_endpoint(client):
    r = client.get("/api/india-impact?flare_class=X1.0")
    assert r.status_code == 200
    body = r.json()
    assert len(body["regions"]) >= 30
    assert {reg["zone"] for reg in body["regions"]} >= {"north", "south"}


def test_explain_endpoint_returns_features(client):
    r = client.get("/api/explain?flare_class=M3.5")
    assert r.status_code == 200
    body = r.json()
    assert len(body["features"]) == 7
    assert body["topContributors"]


def test_metrics_endpoint_shape(client):
    r = client.get("/api/metrics")
    assert r.status_code == 200
    body = r.json()
    assert {"podM", "farM", "csiM", "podX", "farX", "csiX"} <= body.keys()
    assert "confusion" in body


def test_replay_endpoint_streams_points(client):
    r = client.get("/api/replay/3")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 3
    assert len(body["points"]) > 0


def test_update_endpoint_accepts_pipeline_tick(client):
    payload = {
        "timestamp_utc": "2026-08-20T00:00:00Z",
        "telemetry": {"soft_flux": 1e-5, "hard_25_50": 7.5},
        "features": [0.0, 0.0, 0.035],
        "status": {
            "systemStatus": {
                "state": "QUIET",
                "stateLabel": "Quiet Sun",
                "stateColor": "#2ECC71",
                "since": "2026-08-20T00:00:00Z",
                "pipeline": "Operational",
                "dataLatency": "1.2s",
                "lastSync": "2026-08-20T00:00:00Z",
                "pradanSync": "Healthy",
                "al1Sync": "Healthy",
                "modelVersion": "v2.1.3",
            },
            "nowcast": {
                "class": "—",
                "peakFlux": 1e-5,
                "onset": "—",
                "peakTime": "—",
                "currentPhase": "Quiet Sun",
                "adaptiveThreshold": 3.0,
                "rollingMAD": 2.8e-8,
                "zScore": 0.1,
                "confidence": 0.98,
            },
            "forecast": {
                "probability": 12,
                "updatedAt": "2026-08-20T00:00:00Z",
                "windowStart": "2026-08-20T00:00:00Z",
                "windowEnd": "2026-08-20T00:00:00Z",
                "nextClass": "C-class",
                "leadTime": 0,
                "tcnConfidence": 0.12,
            },
            "hardnessRatio": {
                "current": 0.035,
                "baseline": 0.035,
                "threshold": 0.06,
                "trend": "stable",
                "preFlareSignal": False,
                "minutesEarly": 0,
            },
            "alerts": [],
            "flareClass": "B1.0",
        },
    }
    r = client.post("/api/update", json=payload)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    status = client.get("/api/status")
    assert status.status_code == 200
    assert status.json()["flareClass"] == "B1.0"
