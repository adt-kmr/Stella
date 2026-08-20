"""Adaptive-threshold behaviour on quiet vs flaring series."""

import numpy as np
import pytest

from pipeline.thresholds import adaptive_threshold, classify_flare, detect_events, flare_class_float


def test_no_detection_in_quiet_background():
    quiet = np.full(200, 1e-6)  # steady C-level
    events = detect_events(quiet, window=15, k=6.0, min_steps=3)
    assert events == []


def test_detects_clean_impulse():
    series = np.full(120, 1e-6)
    series[60:66] = 2e-4  # X-level burst
    events = detect_events(series, window=15, k=4.0, min_steps=3)
    assert len(events) == 1
    start, end = events[0]
    assert start <= 60
    assert end >= 65


def test_adaptive_threshold_tracks_background_rise():
    # A slowly rising background must not move the threshold linearly,
    # otherwise the quiet rise would be flagged.
    ramp = np.linspace(1e-6, 1e-5, 100)
    thr = adaptive_threshold(ramp, window=15, k=6.0)
    below = np.log10(np.maximum(ramp, 1e-10)) < thr
    assert below[-1]  # quiet ramp stays under threshold


def test_classify_flare_roundtrip():
    for label in ("B4.5", "C3.2", "M3.5", "X1.0", "X10.0"):
        mag = flare_class_float(label)
        assert flare_class_float(classify_flare(mag)) == pytest.approx(mag)


def test_classify_flare_ordering():
    assert flare_class_float("B5.0") < flare_class_float("C5.0")
    assert flare_class_float("C5.0") < flare_class_float("M5.0")
    assert flare_class_float("M5.0") < flare_class_float("X5.0")
