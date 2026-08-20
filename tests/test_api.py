"""API smoke tests: endpoints respond with the documented schema."""

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_status_endpoint():
    r = client.get("/api/status")
    assert r.status_code == 200
    body = r.json()
    assert body["system"] == "STELLA"
    assert body["solar_state"] in ("online", "degraded", "offline")


def test_timeseries_endpoint():
    r = client.get("/api/timeseries?hours=6")
    assert r.status_code == 200
    assert r.json()["hours"] == 6


def test_alerts_endpoint_empty():
    r = client.get("/api/alerts")
    assert r.status_code == 200
    assert r.json() == []


def test_catalog_endpoint_degrades_gracefully():
    r = client.get("/api/catalog")
    assert r.status_code == 200  # [] when no processed cache


def test_impact_endpoint_schema():
    r = client.get("/api/impact?flare_class=M3.5&lead_minutes=30")
    assert r.status_code == 200
    body = r.json()
    assert body["flare_class"] == "M3.5"
    assert len(body["domains"]) == 7
    assert "overall" in body


def test_india_impact_endpoint():
    r = client.get("/api/india-impact?flare_class=X1.0")
    assert r.status_code == 200
    assert len(r.json()["regions"]) >= 4


def test_explain_endpoint():
    r = client.get("/api/explain?flare_class=M3.5")
    assert r.status_code == 200
    features = r.json()["features"]
    assert len(features) == 7
    assert abs(sum(f["importance"] for f in features) - 1.0) < 1e-6


def test_metrics_endpoint_shape():
    r = client.get("/api/metrics")
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "stella-cascade"
    assert {row["metric"] for row in body["rows"]} >= {"POD", "FAR", "CSI", "Lead Time (min)"}


def test_update_endpoint_roundtrip():
    payload = [
        {
            "timestamp": "2026-08-20T00:00:00Z",
            "source": "solexs",
            "soft_x_ray": 1e-5,
            "hard_x_ray": 1e-7,
        }
    ]
    r = client.post("/api/update", json=payload)
    assert r.status_code == 200
    assert r.json()["accepted"] == 1
    status = client.get("/api/status").json()
    assert status["data_cache"] != "empty"


def test_root_info():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["system"] == "STELLA"
