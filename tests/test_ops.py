"""Operations briefing + runtime summaries: pure builders and live endpoints."""

from fastapi.testclient import TestClient

from api.main import app
from pipeline.ops import build_briefing, build_runtime


def test_briefing_without_snapshot_is_graceful():
    out = build_briefing(None)
    assert out["status"] == "no_data"
    assert "headline" in out


def test_briefing_active_flare_headline():
    snapshot = {
        "systemStatus": {"state": "ACTIVE", "stateLabel": "Active Flare", "modelVersion": "v2.1.3"},
        "nowcast": {"class": "M3.5", "currentPhase": "Impulsive Onset", "confidence": 0.94},
        "forecast": {"probability": 87, "nextClass": "M-class", "leadTime": 28},
        "hardnessRatio": {"current": 0.07, "preFlareSignal": True},
        "alerts": [{"ts": "x"}],
        "dataSource": "solexs_hel1os",
    }
    out = build_briefing(snapshot)
    assert out["status"] == "ok"
    assert out["solarState"] == "ACTIVE"
    assert "M3.5" in out["headline"]
    assert out["forecast"]["leadMinutes"] == 28
    assert out["activeAlerts"] == 1
    assert out["hardness"]["preFlareSignal"] is True


def test_briefing_quiet_headline():
    out = build_briefing({"systemStatus": {"state": "QUIET"}})
    assert "Quiet" in out["headline"]


def test_runtime_builder_rounds_uptime():
    out = build_runtime(None, uptime_seconds=12.345, buffered_points=5, buffered_alerts=2)
    assert out["uptimeSeconds"] == 12.3
    assert out["bufferedPoints"] == 5
    assert out["bufferedAlerts"] == 2


def test_ops_endpoints_expose_briefing_and_runtime():
    with TestClient(app) as client:
        briefing = client.get("/api/ops/briefing")
        assert briefing.status_code == 200
        assert briefing.json()["status"] in ("ok", "no_data")

        runtime = client.get("/api/ops/runtime")
        assert runtime.status_code == 200
        assert {"uptimeSeconds", "bufferedPoints", "bufferedAlerts"} <= runtime.json().keys()


def test_metadata_endpoints_are_mounted():
    with TestClient(app) as client:
        for path in ("/api/health", "/api/version", "/api/classes", "/api/domains", "/api/regions"):
            assert client.get(path).status_code == 200
        assert client.get("/api/regions?zone=south").json()["count"] >= 1
