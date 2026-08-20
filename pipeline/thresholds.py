"""Adaptive, MAD-based flare detection thresholds.

Classical fixed thresholds on soft X-ray flux are brittle across solar cycle
background changes. Here the decision boundary tracks a rolling median and
MAD scale of the *background*, so quiet-period variability does not generate
false alarms during solar maximum.
"""

from __future__ import annotations

import numpy as np

from .features import log10_flux, rolling_mad


def adaptive_threshold(flux: np.ndarray, window: int = 15, k: float = 6.0) -> np.ndarray:
    """Rolling upper bound = rolling median + ``k * rolling MAD`` (log space)."""
    x = log10_flux(flux)
    scale = rolling_mad(x, window)
    out = np.full_like(x, np.nan)
    for i in range(len(x)):
        a = max(0, i - window + 1)
        out[i] = np.median(x[a : i + 1]) + k * scale[i]
    return out


def detect_events(
    flux: np.ndarray,
    window: int = 15,
    k: float = 6.0,
    min_steps: int = 3,
) -> list[tuple[int, int]]:
    """Return ``(start, end)`` index ranges where flux exceeds its threshold."""
    x = log10_flux(flux)
    thr = adaptive_threshold(flux, window, k)
    above = x > thr

    events, start = [], None
    for i, flag in enumerate(above):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if i - start >= min_steps:
                events.append((start, i - 1))
            start = None
    if start is not None and len(x) - start >= min_steps:
        events.append((start, len(x) - 1))
    return events


def classify_flare(magnitude: float) -> str:
    """Map a GOES magnitude to a class label.

    ``magnitude`` follows the GOES convention from
    :func:`pipeline.features.soft_flare_level`: X-class is ``10**k``
    (X1 = 1.0, X10 = 10.0), M is 0.1-1.0, C 0.01-0.1, B below that.
    """
    m = float(magnitude)
    if m >= 10.0:
        return f"X{m / 10.0:g}"
    if m >= 1.0:
        return f"M{m:g}"
    if m >= 0.1:
        return f"C{m * 10.0:g}"
    return f"B{max(m * 100.0, 0.01):g}"


def flare_class_float(label: str) -> float:
    """Inverse of :func:`classify_flare`; ``M3.5 -> 3.5``, ``X10 -> 10.0``."""
    label = (label or "").strip().upper()
    if not label:
        return 0.0
    cls_char = label[0]
    try:
        value = float(label[1:])
    except ValueError:
        value = 1.0
    factor = {"X": 10.0, "M": 1.0, "C": 0.1, "B": 0.01}.get(cls_char, 1.0)
    return factor * value
