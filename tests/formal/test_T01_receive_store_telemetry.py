"""T_01 - Receive and Store Satellite Telemetry.

Subsystem ........ Data Ingestion
Designed by ...... Ashish Kumar (28 Oct 2026)
Executed by ...... Pankhil Gupta (07 Nov 2026)
Description ...... Verify that a valid telemetry window is received, stored
                   and prepared for analysis.
Pre-conditions ... Aditya-L1 (SoLEXS/HEL1OS) feed, or the mock/replay telemetry
                   source, available. STELLA backend and database running.

Note: the prototype substitutes its in-memory telemetry store for the
PostgreSQL database described in the SRS; "stored" below is verified against
that store through the public REST API.
"""

from datetime import datetime

import numpy as np

from pipeline.features import build_feature_frame


def _expected_ms(timestamp_utc: str) -> int:
    dt = datetime.fromisoformat(timestamp_utc.replace("Z", "+00:00"))
    return int(dt.timestamp() * 1000)


def test_T01_step01_window_is_received_and_acknowledged(client, restore_state, tick_factory):
    """Step 1 - Satellites send a telemetry window; system acknowledges receipt."""
    tick = tick_factory()
    response = client.post("/api/update", json=tick)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_T01_step02_raw_telemetry_stored_with_timestamp(client, restore_state, tick_factory):
    """Step 2 - Record saved with timestamp; 'telemetry saved' confirmation returned."""
    tick = tick_factory(soft=3.2e-6, hard=8.1)
    assert client.post("/api/update", json=tick).json()["status"] == "ok"

    expected_ts = _expected_ms(tick["timestamp_utc"])
    points = client.get("/api/timeseries?hours=6").json()
    saved = [p for p in points if p["timestamp"] == expected_ts]
    assert len(saved) == 1
    assert saved[0]["softFlux"] == 3.2e-6
    assert saved[0]["hardFlux"] == 8.1 * 1.5e-8


def test_T01_step03_solexs_and_hel1os_aligned_on_common_timestamp(client, restore_state, tick_factory):
    """Step 3 - Both streams aligned on common timestamps."""
    tick = tick_factory()
    client.post("/api/update", json=tick)

    expected_ts = _expected_ms(tick["timestamp_utc"])
    point = next(p for p in client.get("/api/timeseries?hours=6").json() if p["timestamp"] == expected_ts)
    assert {"softFlux", "hardFlux"} <= point.keys()
    assert point["softFlux"] > 0 and point["hardFlux"] > 0
    # One timestamp, two instrument channels -> streams are synchronised.
    assert isinstance(point["timestamp"], int)


def test_T01_step04_feature_vector_complete_and_finite(flare_windows):
    """Step 4 - Feature vector generated with no missing values."""
    soft, hard = flare_windows
    frame = build_feature_frame(soft, hard)
    assert frame.shape == (120, 5)
    assert np.all(np.isfinite(frame))
