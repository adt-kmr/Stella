"""Contingency-table metrics (POD / FAR / CSI) and lead-time savers."""

import numpy as np
import pytest

from pipeline.evaluation import (
    Contingency,
    contingency_table,
    csi,
    far,
    lead_time,
    pod,
    score_run,
)


def test_perfect_forecast():
    pred = np.array([1, 1, 0, 0])
    obs = np.array([1, 1, 0, 0])
    cont = contingency_table(pred, obs)
    assert (cont.hits, cont.misses, cont.false_alarms, cont.correct_null) == (2, 0, 0, 2)
    assert pod(cont) == 1.0
    assert far(cont) == 0.0
    assert csi(cont) == 1.0


def test_known_contingency_values():
    pred = np.array([1, 1, 1, 0, 0])
    obs = np.array([1, 0, 1, 1, 0])
    cont = contingency_table(pred, obs)
    assert (cont.hits, cont.misses, cont.false_alarms, cont.correct_null) == (2, 1, 1, 1)
    assert pod(cont) == pytest.approx(2 / 3)
    assert far(cont) == pytest.approx(1 / 3)
    assert csi(cont) == pytest.approx(2 / 4)


def test_zero_denominator_safety():
    cont = Contingency()
    assert pod(cont) == 0.0
    assert far(cont) == 0.0
    assert csi(cont) == 0.0


def test_lead_time_nonzero_exact():
    # alert 0 min before event -> 10-min lead measured exactly
    lead = lead_time(np.array([4910.0]), np.array([4920.0]))
    assert lead == pytest.approx(10.0)


def test_score_run_integration():
    pred = np.array([1, 1, 0, 0])
    obs = np.array([1, 1, 0, 0])
    scores = score_run(pred, obs, alert_times=np.array([0.0]), event_times=np.array([10.0]))
    assert scores.pod == 1.0
    assert scores.mean_lead_minutes == pytest.approx(10.0)
