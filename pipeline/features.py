"""Neupert-effect and auxiliary feature engineering.

The central insight of Helios-Cortex: in the Neupert effect, non-thermal
hard X-rays (HEL1OS) peak *before* thermal soft X-rays (SoLEXS). Their
ratio therefore carries an early-warning signature. All functions are
numpy-based and leak-free where a window is specified (only past data).
"""

from __future__ import annotations

import numpy as np

Floor = 1e-10


def neupert_ratio(soft: np.ndarray, hard: np.ndarray) -> np.ndarray:
    """Hard/soft ratio -- rises early because HEL1OS leads SoLEXS.

    ``hard / clamp(soft)``; low -8 power (10^-8 W/m^2) is floored
    to avoid division blow-ups.
    """
    soft = np.asarray(soft, dtype=float)
    hard = np.asarray(hard, dtype=float)
    return hard / np.maximum(soft, Floor)


def log10_flux(arr: np.ndarray) -> np.ndarray:
    """Compress flux to its decadic logarithm (standard in flare catalogues)."""
    return np.log10(np.maximum(np.asarray(arr, dtype=float), Floor))


def spectral_hardness(soft: np.ndarray, hard: np.ndarray) -> np.ndarray:
    """Hardness ratio used to separate impulsive from gradual flares."""
    s = np.maximum(np.asarray(soft, dtype=float), Floor)
    h = np.maximum(np.asarray(hard, dtype=float), Floor)
    return (h - s) / (h + s)


def flux_rise_rate(arr: np.ndarray, window: int = 5) -> np.ndarray:
    """Local linear slope of log-flux within past ``window`` steps.

    The warm-up region (first ``window-1`` steps) is set to zero so the
    feature matrix stays finite for model inputs.
    """
    x = log10_flux(arr)
    out = np.zeros_like(x)
    for i in range(window - 1, len(x)):
        seg = x[i - window + 1 : i + 1]
        out[i] = np.polyfit(np.arange(window), seg, 1)[0]
    return out


def rolling_mad(arr: np.ndarray, window: int = 15, robust: float = 1.4826) -> np.ndarray:
    """Rolling median-absolute-deviation scaled to a std estimate.

    Used for the adaptive background/noise model behind thresholding.
    """
    x = np.asarray(arr, dtype=float)
    out = np.full_like(x, np.nan)
    for i in range(len(x)):
        a = max(0, i - window + 1)
        out[i] = robust * np.median(np.abs(x[a : i + 1] - np.median(x[a : i + 1])))
    return out


def adaptive_zscore(arr: np.ndarray, window: int = 15) -> np.ndarray:
    """Robust rolling z-score using median + MAD instead of mean + std.

    MAD-based statistics are far less distorted by the flare itself,
    keeping the background estimate stable across the rise. When the window
    is degenerate (scale ~ eps) a floor keeps the score finite so a true
    outlier still surfaces as a large positive value.
    """
    x = np.asarray(arr, dtype=float)
    out = np.full_like(x, np.nan)
    scale = rolling_mad(x, window)
    for i in range(len(x)):
        a = max(0, i - window + 1)
        center = np.median(x[a : i + 1])
        s = max(scale[i], 1e-12 * max(abs(center), 1.0))
        out[i] = (x[i] - center) / s
    return out


def soft_flare_level(flux: float) -> float:
    """Map a soft X-ray flux (W/m^2) to the GOES magnitude scale.

    ``1e-4 -> 10.0`` (X1), ``1e-5 -> 1.0`` (M1), ``1e-6 -> 0.1`` (C1),
    ``1e-7 -> 0.01`` (B1) -- the same axis consumed by
    :func:`pipeline.thresholds.classify_flare`.
    """
    return float(flux) * 1e5


def build_feature_frame(
    soft: np.ndarray,
    hard: np.ndarray,
    mad_window: int = 15,
    rise_window: int = 5,
) -> np.ndarray:
    """Assemble the (L, 5) feature tensor for model inputs.

    Columns: [log soft flux, log hard flux, neupert ratio, hardness, rise rate].
    """
    return np.stack(
        [
            log10_flux(soft),
            log10_flux(hard),
            neupert_ratio(soft, hard),
            spectral_hardness(soft, hard),
            flux_rise_rate(soft, rise_window),
        ],
        axis=-1,
    )
