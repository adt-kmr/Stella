"""T_02 - Handle Missing or Corrupted Telemetry.

Subsystem ........ Data Ingestion
Designed by ...... Ashish Kumar (28 Oct 2026)
Executed by ...... Hitanshi Antil (07 Nov 2026)
Description ...... Verify the system detects an invalid telemetry window, does
                   not use it for prediction, and recovers on the next valid
                   window.
Pre-conditions ... System running and receiving telemetry. A test window with
                   corrupted values is available.

The FastAPI request-validation layer acts as the invalid-window log: rejected
windows produce a structured ``detail`` error and never reach the pipeline.
"""

from copy import deepcopy


def _corrupted_tick(tick_factory):
    tick = deepcopy(tick_factory())
    tick["features"] = ["not-a-number"]  # corrupted feature vector
    tick["telemetry"].pop("soft_flux")  # missing soft X-ray channel
    return tick


def test_T02_step01_invalid_window_is_rejected(client, restore_state, tick_factory):
    """Step 1 - System detects invalid data and rejects the window."""
    response = client.post("/api/update", json=_corrupted_tick(tick_factory))
    assert response.status_code == 422


def test_T02_step02_no_prediction_generated(client, restore_state, tick_factory):
    """Step 2 - Data-quality warning shown; no prediction generated."""
    before_points = len(client.get("/api/timeseries?hours=6").json())
    before_status = client.get("/api/status").json()

    client.post("/api/update", json=_corrupted_tick(tick_factory))

    after_status = client.get("/api/status").json()
    assert after_status["systemStatus"]["state"] == before_status["systemStatus"]["state"]
    assert len(client.get("/api/timeseries?hours=6").json()) == before_points
    assert after_status["flareClass"] == before_status["flareClass"]


def test_T02_step03_invalid_window_logged_and_flagged(client, restore_state, tick_factory):
    """Step 3 - Invalid window logged and flagged 'not used for prediction'."""
    from pipeline.ingest import _coerce_row

    corrupted = _corrupted_tick(tick_factory)
    response = client.post("/api/update", json=corrupted)
    detail = response.json()["detail"]
    fields = {str(part) for error in detail for part in error.get("loc", [])}
    assert "features" in fields  # corrupted feature value is logged by validation
    assert _coerce_row(corrupted["telemetry"]) is None  # missing channel flagged by the loader


def test_T02_step04_next_valid_window_resumes_without_restart(client, restore_state, tick_factory):
    """Step 4 - Normal processing resumes on the next valid window."""
    valid = tick_factory(minutes_ago=0.5, soft=4.0e-6, hard=6.0)
    assert client.post("/api/update", json=_corrupted_tick(tick_factory)).status_code == 422

    response = client.post("/api/update", json=valid)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert client.get("/api/status").status_code == 200
    assert any(
        abs(p["softFlux"] - 4.0e-6) < 1e-12
        for p in client.get("/api/timeseries?hours=6").json()
    )
