"""Impact-assessment determinism: domains, regions, risk escalation."""

import pytest

from pipeline.impact import domain_risks, india_risks


def test_domain_risks_keyed_and_ordered():
    rows = domain_risks("M3.5", 30)
    assert len(rows) == 7
    names = {r["domain"] for r in rows}
    assert {"Navigation", "Power Grid", "Space Station"} <= names
    for r in rows:
        assert r["risk"] in ("green", "yellow", "orange", "red")


def test_x_class_rises_above_m_class():
    m_risk = {r["domain"]: r["risk"] for r in domain_risks("M3.5", 30)}
    x_risk = {r["domain"]: r["risk"] for r in domain_risks("X10", 30)}
    order = ("green", "yellow", "orange", "red")
    for d in m_risk:
        assert order.index(x_risk[d]) >= order.index(m_risk[d])


def test_higher_lead_time_raises_risk():
    low = {r["domain"]: r["risk"] for r in domain_risks("M3.5", 10)}
    high = {r["domain"]: r["risk"] for r in domain_risks("M3.5", 45)}
    assert high["Navigation"] != low["Navigation"]


def test_india_risks_all_states_and_stations():
    rows = india_risks("M3.5")
    assert len(rows) >= 4
    stations = {r["isro_station"] for r in rows if r["isro_station"]}
    assert {"SDSC-SHAR", "URSC", "VSSC", "SAC"} <= stations
    for r in rows:
        assert r["gps_risk"] in ("green", "yellow", "orange", "red")
        assert r["gic_risk"] in ("green", "yellow", "orange", "red")


def test_inference_no_crash_without_models():
    import numpy as np

    from pipeline.inference import run_inference

    soft = np.full(60, 1e-6)
    hard = np.full(60, 1e-8)
    result = run_inference(soft, hard, threshold_class="M1.0")
    assert result.decision.status in ("silent", "watch", "alert")
    assert result.feature_stats["soft_log"] == pytest.approx(-6.0)
