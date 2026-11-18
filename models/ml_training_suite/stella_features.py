"""STELLA feature engineering (causal only).

Every value at grid index t uses only samples with index <= t (the grid timestamp is the
END of the averaging bin, so a sample at time t contains data from (t - cadence, t]).

Channel order (fixed):
  0 sxr_log_flux        1 sxr_growth        2 sxr_temp_proxy     3 sxr_heating_rate
  4 sxr_excess_z        5 sxr_log_max24h    6 hxr_log_rate_lo    7 hxr_log_rate_hi
  8 hxr_growth          9 sxr_spectral_mask 10 hxr_mask

Undefined values are NaN in the raw feature array; they are neutralised (set to 0) only
AFTER normalisation (see stella_data.Normalizer).
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

FEATURE_NAMES = [
    "sxr_log_flux",
    "sxr_growth",
    "sxr_temp_proxy",
    "sxr_heating_rate",
    "sxr_excess_z",
    "sxr_log_max24h",
    "hxr_log_rate_lo",
    "hxr_log_rate_hi",
    "hxr_growth",
    "sxr_spectral_mask",
    "hxr_mask",
]
N_CHANNELS = len(FEATURE_NAMES)  # 11
CONTINUOUS_CHANNELS = list(range(9))  # normalised channels; 9 and 10 are 0/1 masks
CORE_SXR_CHANNELS = [0, 1, 4, 5]  # must be finite for a window to be usable
SPECTRAL_DEPENDENT = [2, 3]  # zeroed when sxr_spectral_mask == 0
HXR_DEPENDENT = [6, 7, 8]  # zeroed when hxr_mask == 0


def fill_short_gaps(x: np.ndarray, max_gap: int):
    """Linearly interpolate runs of NaN no longer than `max_gap` that are bounded on both
    sides by valid samples. Longer runs are left as NaN (nothing partially filled).

    Returns (filled, imputed_flag)."""
    x = np.asarray(x, dtype=np.float64)
    missing = ~np.isfinite(x)
    filled = np.where(missing, np.nan, x)
    imputed = np.zeros(x.shape, dtype=bool)
    if max_gap <= 0 or not missing.any():
        return filled, imputed
    d = np.diff(np.concatenate([[0], missing.astype(np.int8), [0]]))
    starts = np.flatnonzero(d == 1)
    ends = np.flatnonzero(d == -1)  # exclusive
    n = len(x)
    for s, e in zip(starts, ends):
        if (e - s) <= max_gap and s > 0 and e < n:
            filled[s:e] = np.interp(np.arange(s, e), [s - 1, e], [x[s - 1], x[e]])
            imputed[s:e] = True
    return filled, imputed


def trailing_slope(y: np.ndarray, n: int = 5) -> np.ndarray:
    """Least-squares slope (units of y per STEP) over the last n samples [t-n+1, t].
    NaN if any of the n samples is NaN."""
    out = np.full(len(y), np.nan)
    if len(y) < n:
        return out
    w = np.arange(n, dtype=np.float64) - (n - 1) / 2.0
    win = sliding_window_view(np.asarray(y, dtype=np.float64), n)
    out[n - 1:] = (win * w).sum(axis=1) / (w ** 2).sum()
    return out


def rolling_median_mad(x: np.ndarray, window: int, min_periods: int, chunk: int = 20000):
    """Trailing median and MAD over the `window` samples BEFORE each index (current excluded).
    NaNs are ignored; result is NaN when fewer than `min_periods` finite samples exist."""
    x = np.asarray(x, dtype=np.float64)
    T = len(x)
    padded = np.concatenate([np.full(window, np.nan), x])
    windows = sliding_window_view(padded, window)[:T]  # windows[i] == x[i-window:i]
    med = np.full(T, np.nan)
    mad = np.full(T, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for s in range(0, T, chunk):
            w = windows[s:s + chunk]
            cnt = np.isfinite(w).sum(axis=1)
            m = np.nanmedian(w, axis=1)
            d = np.nanmedian(np.abs(w - m[:, None]), axis=1)
            bad = cnt < min_periods
            m[bad] = np.nan
            d[bad] = np.nan
            med[s:s + chunk] = m
            mad[s:s + chunk] = d
    return med, mad


def prior_rolling_max(x: np.ndarray, window: int, min_periods: int) -> np.ndarray:
    """Maximum over the `window` samples preceding each index (current excluded)."""
    return pd.Series(x).shift(1).rolling(window, min_periods=min_periods).max().to_numpy()


def compute_features(long_f, short_f, hxr_lo, hxr_hi, hxr_live, cadence_min: float, fcfg: dict) -> np.ndarray:
    """Build the (T, 11) raw feature array.

    long_f / short_f : linear SXR long/short channel (gap-filled; NaN if unavailable)
    hxr_lo / hxr_hi  : HEL1OS counts per bin in the low / high band (NaN if unavailable)
    hxr_live         : HEL1OS live time per bin (same time unit used for the rate)
    """
    long_f = np.asarray(long_f, dtype=np.float64)
    short_f = np.asarray(short_f, dtype=np.float64)
    T = len(long_f)
    n = int(fcfg["slope_steps"])
    f = np.full((T, N_CHANNELS), np.nan, dtype=np.float64)

    # --- SXR ---
    long_ok = np.isfinite(long_f) & (long_f > 0)
    log_flux = np.full(T, np.nan)
    log_flux[long_ok] = np.log10(long_f[long_ok])
    f[:, 0] = log_flux
    f[:, 1] = trailing_slope(log_flux, n) / cadence_min

    short_ok = np.isfinite(short_f) & (short_f > 0)
    spec = long_ok & short_ok
    temp = np.full(T, np.nan)
    temp[spec] = np.log10(short_f[spec] / long_f[spec])
    f[:, 2] = temp
    f[:, 3] = trailing_slope(temp, n) / cadence_min

    med, mad = rolling_median_mad(log_flux, int(fcfg["excess_window_steps"]), int(fcfg["excess_min_periods"]))
    scale = np.maximum(1.4826 * mad, float(fcfg["mad_floor"]))  # NaN propagates
    f[:, 4] = (log_flux - med) / scale

    max_steps = int(round(float(fcfg["max_window_minutes"]) / cadence_min))
    f[:, 5] = prior_rolling_max(log_flux, max_steps, int(fcfg["max_min_periods"]))

    # --- HXR (never synthesised: unavailable bins stay NaN and mask = 0) ---
    lo = np.asarray(hxr_lo, dtype=np.float64)
    hi = np.asarray(hxr_hi, dtype=np.float64)
    live = np.asarray(hxr_live, dtype=np.float64)
    obs = np.isfinite(lo) & np.isfinite(hi) & np.isfinite(live) & (live > 0) & (lo >= 0) & (hi >= 0)
    lo_r = np.full(T, np.nan)
    hi_r = np.full(T, np.nan)
    tot_r = np.full(T, np.nan)
    lo_r[obs] = np.log10((lo[obs] + 0.5) / live[obs])
    hi_r[obs] = np.log10((hi[obs] + 0.5) / live[obs])
    tot_r[obs] = np.log10((lo[obs] + hi[obs] + 0.5) / live[obs])
    f[:, 6] = lo_r
    f[:, 7] = hi_r
    f[:, 8] = trailing_slope(tot_r, n) / cadence_min

    f[:, 9] = spec.astype(np.float64)
    f[:, 10] = obs.astype(np.float64)
    return f


def valid_windows(bad: np.ndarray, imputed: np.ndarray, L: int, max_imputed_frac: float) -> np.ndarray:
    """Boolean array over end index t: window [t-L+1, t] is usable iff it contains no 'bad'
    sample (unfilled gap / undefined core SXR feature) and at most max_imputed_frac imputed."""
    T = len(bad)
    ok = np.zeros(T, dtype=bool)
    if T < L:
        return ok
    cb = np.concatenate([[0], np.cumsum(bad, dtype=np.int64)])
    ci = np.concatenate([[0], np.cumsum(imputed, dtype=np.int64)])
    t = np.arange(L - 1, T)
    nb = cb[t + 1] - cb[t + 1 - L]
    ni = ci[t + 1] - ci[t + 1 - L]
    ok[L - 1:] = (nb == 0) & (ni <= max_imputed_frac * L)
    return ok
