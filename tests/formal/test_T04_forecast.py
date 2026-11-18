"""T_04 - Forecast Flare Severity and Lead Time (TCN).

Subsystem ........ Forecast Model
Designed by ...... Aditya Kumar (28 Oct 2026)
Executed by ...... Hitanshi Antil (08 Nov 2026)
Description ...... Verify the Dilated TCN model predicts flare severity and
                   lead time from a sequence of recent windows.
Pre-conditions ... Sequence of valid recent windows available. Forecast model
                   loaded. Pre-flare and quiet-Sun test sequences available.

The replay endpoint exposes the recorded forecast output (severity class and
estimated lead time) used by the dashboard when no neural checkpoint is
loaded, so the forecast contract is verified there as well as in inference.
"""

from datetime import datetime

from pipeline.inference import run_inference
from pipeline.thresholds import flare_class_float


def test_T04_step01_preflare_sequence_runs_without_error(flare_windows):
    """Step 1 - Submit a sequence showing pre-flare activity; no error."""
    soft, hard = flare_windows
    result = run_inference(soft, hard, threshold_class="M1.0", lead_min=30)
    assert 0.0 <= result.forecast_prob <= 1.0


def test_T04_step02_severity_class_and_lead_time_returned(client, flare_windows):
    """Step 2 - Severity class and estimated lead time returned."""
    soft, hard = flare_windows
    result = run_inference(soft, hard, threshold_class="M1.0", lead_min=30)
    assert result.lead_minutes >= 0

    replay = client.get("/api/replay/3").json()
    assert replay["class"].startswith("X")
    assert replay["leadTime"] >= 15  # NFR-1 warning lead requirement
    assert flare_class_float(replay["class"]) >= flare_class_float("M1.0")


def test_T04_step03_quiet_sequence_gives_low_severity(client, quiet_windows):
    """Step 3 - Quiet-Sun sequence: low severity, no imminent flare predicted."""
    soft, hard = quiet_windows
    result = run_inference(soft, hard, threshold_class="M1.0")
    assert result.decision.status == "silent"
    assert flare_class_float(result.decision.flare_class) < flare_class_float("M1.0")

    replay = client.get("/api/replay/5").json()
    assert replay["leadTime"] < 45
    assert not replay["class"].startswith("X")


def test_T04_step04_both_forecasts_stored_with_timestamps(client, restore_state, tick_factory):
    """Step 4 - Both forecasts saved with timestamps."""
    flare_tick = tick_factory(minutes_ago=2, state="ACTIVE", flare_class="X2.7")
    quiet_tick = tick_factory(minutes_ago=1, state="QUIET", flare_class="B4.1")

    assert client.post("/api/update", json=flare_tick).status_code == 200
    assert client.post("/api/update", json=quiet_tick).status_code == 200

    status = client.get("/api/status").json()
    assert status["forecast"]["updatedAt"] == quiet_tick["status"]["forecast"]["updatedAt"]
    assert status["forecast"]["probability"] == 12

    stamps = {p["timestamp"] for p in client.get("/api/timeseries?hours=6").json()}
    for tick in (flare_tick, quiet_tick):
        dt = datetime.fromisoformat(tick["timestamp_utc"].replace("Z", "+00:00"))
        assert int(dt.timestamp() * 1000) in stamps
