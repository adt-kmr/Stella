"""Feature-engineering correctness: Neupert ratio, MAD, z-score, framing."""

import numpy as np
import pytest

from pipeline.features import (
    adaptive_zscore,
    build_feature_frame,
    flux_rise_rate,
    log10_flux,
    neupert_ratio,
    rolling_mad,
    soft_flare_level,
)


def test_neupert_ratio_positive_and_early_rise():
    quiet_soft = np.full(10, 1e-7)  # C-level
    quiet_hard = np.full(10, 1e-9)
    soft = quiet_soft.copy()
    hard = quiet_hard.copy()
    soft[5:] = 1e-5  # soft flux catches up late
    hard[2:] = 1e-5  # hard flux spikes FIRST
    ratio = neupert_ratio(soft, hard)
    assert ratio[1] < ratio[4]  # ratio rises while hard leads


def test_log_flux_shape_and_monotonic():
    x = log10_flux(np.array([1e-4, 1e-5, 1e-6]))
    assert np.all(np.diff(x) < 0)


def test_rolling_mad_finite_and_nonnegative():
    mad = rolling_mad(np.arange(50, dtype=float), window=10)
    assert np.all(np.isfinite(mad))
    assert np.all(mad >= 0)


def test_adaptive_zscore_flags_outlier():
    base = np.ones(30) * 1e-5
    base[-1] = 1e-3  # flare spike at the end
    z = adaptive_zscore(base, window=15)
    assert z[-1] > 3.0
    assert z[0] == 0.0  # degenerate quiet start handled


def test_soft_flare_level_mapping():
    assert soft_flare_level(1e-4) == pytest.approx(10.0)  # X1
    assert soft_flare_level(1e-5) == pytest.approx(1.0)  # M1
    assert soft_flare_level(1e-6) == pytest.approx(0.1)  # C1


def test_build_feature_frame_columns():
    soft = np.random.default_rng(0).uniform(1e-7, 1e-5, 60)
    hard = np.random.default_rng(1).uniform(1e-9, 1e-6, 60)
    frame = build_feature_frame(soft, hard)
    assert frame.shape == (60, 5)
    assert np.all(np.isfinite(frame))


def test_rise_rate_zero_for_flat_series():
    rr = flux_rise_rate(np.full(20, 1e-5), window=5)
    assert np.all(rr[4:] == pytest.approx(0.0, abs=1e-9))
