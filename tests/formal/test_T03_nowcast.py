"""T_03 - Nowcast Flare Activity (Conv1D).

Subsystem ........ Nowcast Model
Designed by ...... Aditya Kumar (28 Oct 2026)
Executed by ...... Pankhil Gupta (08 Nov 2026)
Description ...... Verify the Conv1D nowcast model returns a flare likelihood
                   and distinguishes flare activity from quiet-Sun conditions.
Pre-conditions ... Valid feature vector available (T_01 passed). Nowcast model
                   loaded. Test windows for a known flare and quiet-Sun
                   conditions available.

With no trained checkpoint present the cascade deliberately degrades to its
MAD-threshold detector; the likelihood is still produced in [0, 1] and the
flare/quiet separation remains testable.
"""

from datetime import datetime

from pipeline.features import soft_flare_level
from pipeline.inference import run_inference
from pipeline.thresholds import classify_flare, detect_events, flare_class_float


def test_T03_step01_known_flare_window_runs_without_error(flare_windows):
    """Step 1 - Submit features from a known flare; model runs without error."""
    soft, hard = flare_windows
    result = run_inference(soft, hard, threshold_class="M1.0")
    assert 0.0 <= result.nowcast_prob <= 1.0


def test_T03_step02_likelihood_above_threshold_for_flare(flare_windows):
    """Step 2 - Likelihood in [0,1] returned, above the detection threshold."""
    soft, hard = flare_windows
    result = run_inference(soft, hard, threshold_class="M1.0")
    magnitude = soft_flare_level(float(soft.max()))
    flare_class = classify_flare(magnitude)
    assert flare_class_float(flare_class) >= flare_class_float("M1.0")
    assert result.nowcast_prob >= 0.5
    assert detect_events(soft)  # known flare is detected


def test_T03_step03_quiet_sun_likelihood_below_threshold(quiet_windows):
    """Step 3 - Quiet-Sun likelihood returned below the detection threshold."""
    soft, hard = quiet_windows
    magnitude = soft_flare_level(float(soft.max()))
    assert flare_class_float(classify_flare(magnitude)) < flare_class_float("M1.0")
    result = run_inference(soft, hard, threshold_class="M1.0")
    assert 0.0 <= result.nowcast_prob < 0.5
    assert detect_events(soft) == []


def test_T03_step04_both_nowcasts_stored_with_timestamps(client, restore_state, tick_factory, flare_windows, quiet_windows):
    """Step 4 - Both predictions saved with timestamps."""
    soft_flare, _ = flare_windows
    soft_quiet, _ = quiet_windows
    flare_tick = tick_factory(minutes_ago=2, state="ACTIVE", flare_class="X2.0", soft=float(soft_flare.max()))
    quiet_tick = tick_factory(minutes_ago=1, state="QUIET", flare_class="B1.0", soft=float(soft_quiet.max()))

    assert client.post("/api/update", json=flare_tick).status_code == 200
    assert client.post("/api/update", json=quiet_tick).status_code == 200

    status = client.get("/api/status").json()
    assert status["flareClass"] == "B1.0"
    assert status["nowcast"]["peakFlux"] == quiet_tick["status"]["nowcast"]["peakFlux"]

    stamps = {p["timestamp"] for p in client.get("/api/timeseries?hours=6").json()}
    for tick in (flare_tick, quiet_tick):
        dt = datetime.fromisoformat(tick["timestamp_utc"].replace("Z", "+00:00"))
        assert int(dt.timestamp() * 1000) in stamps
