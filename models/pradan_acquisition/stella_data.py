"""STELLA data pipeline: PRADAN file loading (fully config-driven), resampling, gap handling,
labels, normalisation and PyTorch datasets.

NOTHING about PRADAN file layouts is hard-coded: file globs, file format, FITS HDU, time column /
time convention and all column names come from the JSON config. If the config still contains a
value starting with "REQUIRED", loading stops with a list of what you must fill in.
"""
from __future__ import annotations

import copy
import glob
import hashlib
import json
import os
import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from stella_features import (
    CONTINUOUS_CHANNELS, CORE_SXR_CHANNELS, FEATURE_NAMES, HXR_DEPENDENT, N_CHANNELS,
    SPECTRAL_DEPENDENT, compute_features, fill_short_gaps, valid_windows,
)

CLASS_NAMES = {1: "B", 2: "C", 3: "M", 4: "X"}
CLASS_FROM_LETTER = {"B": 1, "C": 2, "M": 3, "X": 4}

# ----------------------------------------------------------------------------- config
DEFAULTS = {
    "seed": 42,
    "data": {
        "cadence_minutes": 1.0,
        "max_gap_steps": 2,
        "max_imputed_fraction": 0.10,
        "cache_dir": ".stella_cache",
        "purge_context": True,  # windows must lie fully inside their split's time range
    },
    "features": {
        "slope_steps": 5,
        "excess_window_steps": 180,
        "excess_min_periods": 120,
        "mad_floor": 1e-3,  # floor on 1.4826*MAD (log10 units) to avoid division by ~0
        "max_window_minutes": 1440,
        "max_min_periods": 180,
    },
    "normalization": {"clip": 5.0, "min_scale": 1e-6},
    "labels": {
        "nowcast_positive_offset_min": 5,
        "nowcast_dontcare_halfwidth_min": 5,
        "horizon_min": 60,
        # Only used if the catalog has a peak-flux column instead of a class column.
        # Standard GOES definitions in W/m^2; valid ONLY if your catalog's peak flux is in W/m^2.
        "class_thresholds_w_m2": {"B": 1e-7, "C": 1e-6, "M": 1e-5, "X": 1e-4},
        "eval_exclude_decay": True,
    },
    "evaluation": {"detect_window_start_offset_min": 0, "default_threshold": 0.5},
    "nowcaster": {
        "context_minutes": 30,
        "model": {"hidden": 64, "kernel_size": 3, "dilations": [1, 2, 4, 8], "dropout": 0.1},
        "train": {},
    },
    "forecaster": {
        "context_minutes": 253,  # set 180 for the shorter context
        "model": {"hidden": 64, "kernel_size": 3, "dilations": [1, 2, 4, 8, 16, 32], "dropout": 0.1},
        "train": {},
    },
    "train_defaults": {
        "epochs": 30, "batch_size": 256, "lr": 1e-3, "weight_decay": 1e-4, "optimizer": "adamw",
        "scheduler": "none", "grad_clip": 1.0, "patience": 8, "monitor": "val_loss",
        "pos_weight": None, "negative_fraction": 1.0, "num_workers": 0,
        "lead_loss_weight": 1.0, "huber_delta": 0.1, "deterministic": False,
    },
}


def _deep_merge(base, over):
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _find_required(obj, path=""):
    bad = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            bad += _find_required(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            bad += _find_required(v, f"{path}[{i}]")
    elif isinstance(obj, str) and obj.startswith("REQUIRED"):
        bad.append(path)
    return bad


def load_config(path):
    with open(path) as fh:
        user = json.load(fh)
    cfg = _deep_merge(DEFAULTS, user)
    for kind in ("nowcaster", "forecaster"):
        cfg[kind]["train"] = _deep_merge(cfg["train_defaults"], cfg[kind].get("train", {}))
    # the optional 'pradan' (downloader) section is validated by stella_pradan.py, not here
    missing = _find_required({k: v for k, v in cfg.items() if k != "pradan"})
    if missing:
        raise SystemExit("Config still has unfilled REQUIRED fields:\n  " + "\n  ".join(missing))
    return cfg


# ----------------------------------------------------------------------------- file reading
def _expand(files):
    files = [files] if isinstance(files, str) else list(files)
    out = []
    for pat in files:
        out += sorted(glob.glob(os.path.expanduser(pat), recursive=True))
    out = list(dict.fromkeys(out))
    if not out:
        raise FileNotFoundError(f"No files matched: {files}")
    return out


def read_table(path, fmt="auto", hdu=1):
    """Read csv / tsv / parquet / fits-table into a DataFrame (scalar columns only for FITS)."""
    fmt = (fmt or "auto").lower()
    if fmt == "auto":
        p = path.lower()
        if p.endswith(".gz"):
            p = p[:-3]
        ext = p.rsplit(".", 1)[-1]
        fmt = {"csv": "csv", "tsv": "tsv", "txt": "tsv", "parquet": "parquet"}.get(ext, "fits")
    if fmt == "csv":
        return pd.read_csv(path)
    if fmt == "tsv":
        return pd.read_csv(path, sep="\t")
    if fmt == "parquet":
        return pd.read_parquet(path)
    if fmt == "fits":
        from astropy.io import fits  # lazy import
        with fits.open(path, memmap=False) as hd:
            data = hd[hdu].data
            cols = {}
            for name in data.columns.names:
                arr = np.asarray(data[name])
                if arr.ndim != 1:
                    warnings.warn(f"{os.path.basename(path)}: skipping non-scalar column '{name}'")
                    continue
                if arr.dtype.byteorder not in ("=", "|"):
                    arr = arr.astype(arr.dtype.newbyteorder("="))
                cols[name] = arr
        return pd.DataFrame(cols)
    raise ValueError(f"unsupported format '{fmt}'")


def _resolve(df, name):
    if name in df.columns:
        return name
    low = {str(c).lower(): c for c in df.columns}
    if str(name).lower() in low:
        return low[str(name).lower()]
    raise KeyError(f"column '{name}' not found. Available columns: {list(df.columns)[:60]}")


def _numeric(df, spec, bad_values=None):
    """spec: column name, or list of names that are SUMMED (NaN if any is missing)."""
    names = [spec] if isinstance(spec, str) else list(spec)
    cols = []
    for n in names:
        s = pd.to_numeric(df[_resolve(df, n)], errors="coerce")
        if bad_values:
            s = s.mask(s.isin(bad_values))
        cols.append(s)
    return pd.concat(cols, axis=1).sum(axis=1, min_count=len(cols))


def parse_time(col, spec):
    """Return tz-naive UTC datetimes. spec['format'] in: iso | unix | mjd | elapsed_seconds."""
    fmt = spec.get("format", "iso")
    if col.dtype == object:
        col = col.map(lambda v: v.decode() if isinstance(v, bytes) else v)
    if fmt == "iso":
        t = pd.to_datetime(col, utc=True, errors="coerce")
    elif fmt == "unix":
        t = pd.to_datetime(pd.to_numeric(col, errors="coerce"), unit="s", utc=True)
    elif fmt == "mjd":  # MJD 40587 == 1970-01-01
        t = pd.to_datetime((pd.to_numeric(col, errors="coerce") - 40587.0) * 86400.0, unit="s", utc=True)
    elif fmt == "elapsed_seconds":
        if not spec.get("epoch"):
            raise ValueError("time.format 'elapsed_seconds' requires time.epoch (ISO UTC string)")
        epoch = pd.Timestamp(spec["epoch"])
        epoch = epoch.tz_localize("UTC") if epoch.tzinfo is None else epoch.tz_convert("UTC")
        t = epoch + pd.to_timedelta(pd.to_numeric(col, errors="coerce"), unit="s")
    else:
        raise ValueError(f"unknown time format '{fmt}'")
    return t.dt.tz_convert("UTC").dt.tz_localize(None)


def _load_source(spec, mapping):
    frames = []
    for p in _expand(spec["files"]):
        df = read_table(p, spec.get("format", "auto"), spec.get("hdu", 1))
        t = parse_time(df[_resolve(df, spec["time"]["column"])], spec["time"])
        out = pd.DataFrame({"time": t})
        for name, cs in mapping.items():
            out[name] = np.nan if cs is None else _numeric(df, cs, spec.get("bad_values"))
        frames.append(out)
    allf = pd.concat(frames, ignore_index=True).dropna(subset=["time"])
    return allf.set_index("time").sort_index()


# ----------------------------------------------------------------------------- series
@dataclass
class StellaSeries:
    times: np.ndarray  # datetime64[ns], bin END timestamps on a regular grid
    features: np.ndarray  # (T, 11) float32, RAW (NaN where undefined)
    sxr_imputed: np.ndarray  # bool
    bad: np.ndarray  # bool: long SXR missing or core SXR feature undefined
    cadence_min: float
    events: pd.DataFrame = field(default=None)  # onset, peak, end (datetime64), cls (1=B..4=X)

    @property
    def minutes(self):
        return (self.times - self.times[0]) / np.timedelta64(1, "m")

    def to_minutes(self, ts):
        return (np.asarray(ts, dtype="datetime64[ns]") - self.times[0]) / np.timedelta64(1, "m")


def _cache_key(cfg):
    stats = []
    for src in ("sxr", "hxr"):
        for p in _expand(cfg["data"][src]["files"]):
            st = os.stat(p)
            stats.append((p, st.st_size, int(st.st_mtime)))
    payload = json.dumps({"d": cfg["data"], "f": cfg["features"], "s": stats}, sort_keys=True, default=str)
    return hashlib.sha1(payload.encode()).hexdigest()[:16]


def load_series(cfg, use_cache=True) -> StellaSeries:
    d = cfg["data"]
    cad = float(d["cadence_minutes"])
    events = load_catalog(cfg)
    cache_dir = d.get("cache_dir")
    cache_file = None
    if use_cache and cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        cache_file = os.path.join(cache_dir, f"series_{_cache_key(cfg)}.npz")
        if os.path.exists(cache_file):
            z = np.load(cache_file)
            print(f"[data] loaded cached features: {cache_file}")
            return StellaSeries(z["times"].astype("datetime64[ns]"), z["features"], z["sxr_imputed"],
                                z["bad"], cad, events)

    sx, hx = d["sxr"], d["hxr"]
    sxr = _load_source(sx, {"long": sx["long"], "short": sx.get("short")})
    hxr = _load_source(hx, {"lo": hx["counts_lo"], "hi": hx["counts_hi"], "live": hx["live_time"]})
    if sx.get("short") is None:
        warnings.warn("No SXR short channel configured: temp-proxy channels will be masked everywhere.")
    sxr["long"] = sxr["long"].where(sxr["long"] > 0)
    sxr["short"] = sxr["short"].where(sxr["short"] > 0)
    hxr["live"] = hxr["live"].where(hxr["live"] > 0)

    rule = f"{int(round(cad * 60))}s"
    sxr_r = sxr.resample(rule, label="right", closed="right").mean()  # average LINEAR values
    hxr_r = hxr.resample(rule, label="right", closed="right").sum(min_count=1)  # counts & live time add

    t_min = min(sxr_r.index.min(), hxr_r.index.min()).ceil(rule)
    t_max = max(sxr_r.index.max(), hxr_r.index.max()).ceil(rule)
    grid = pd.date_range(t_min, t_max, freq=rule)
    sxr_r, hxr_r = sxr_r.reindex(grid), hxr_r.reindex(grid)

    max_gap = int(d["max_gap_steps"])
    long_f, long_imp = fill_short_gaps(sxr_r["long"].to_numpy(), max_gap)
    short_f, short_imp = fill_short_gaps(sxr_r["short"].to_numpy(), max_gap)
    imputed = long_imp | short_imp

    feats = compute_features(long_f, short_f, hxr_r["lo"].to_numpy(), hxr_r["hi"].to_numpy(),
                             hxr_r["live"].to_numpy(), cad, cfg["features"])
    core_ok = np.isfinite(feats[:, CORE_SXR_CHANNELS]).all(axis=1)
    bad = ~np.isfinite(long_f) | ~core_ok
    times = grid.to_numpy().astype("datetime64[ns]")
    feats = feats.astype(np.float32)
    if cache_file:
        np.savez(cache_file, times=times.astype("int64"), features=feats, sxr_imputed=imputed, bad=bad)
    print(f"[data] grid: {len(grid)} steps ({times[0]} .. {times[-1]}); "
          f"SXR usable {100 * (~bad).mean():.1f}%, HXR available {100 * feats[:, 10].mean():.1f}%")
    return StellaSeries(times, feats, imputed, bad, cad, events)


# ----------------------------------------------------------------------------- catalog / labels
def _parse_class(v):
    s = str(v).strip().upper()[:1]
    return CLASS_FROM_LETTER.get(s, 0)  # A-class / unknown -> 0 (dropped)


def load_catalog(cfg) -> pd.DataFrame:
    c = cfg["data"]["catalog"]
    df = read_table(c["file"], c.get("format", "csv"), c.get("hdu", 1))
    tspec = c.get("time", {"format": "iso"})
    ev = pd.DataFrame({
        "onset": parse_time(df[_resolve(df, c["start"])], tspec),
        "peak": parse_time(df[_resolve(df, c["peak"])], tspec),
        "end": parse_time(df[_resolve(df, c["end"])], tspec),
    })
    if c.get("class"):
        ev["cls"] = df[_resolve(df, c["class"])].map(_parse_class).to_numpy()
    elif c.get("peak_flux"):
        pf = pd.to_numeric(df[_resolve(df, c["peak_flux"])], errors="coerce").to_numpy()
        th = cfg["labels"]["class_thresholds_w_m2"]
        cls = np.zeros(len(pf), dtype=int)
        for k, name in CLASS_NAMES.items():
            cls[pf >= th[name]] = k
        ev["cls"] = cls
    else:
        raise ValueError("catalog needs either 'class' or 'peak_flux' column mapping")
    n0 = len(ev)
    ev = ev.dropna()
    ev = ev[(ev.cls >= 1) & (ev.onset <= ev.peak) & (ev.peak <= ev.end)]
    if len(ev) < n0:
        print(f"[catalog] dropped {n0 - len(ev)} of {n0} rows (NaT, class < B, or onset/peak/end not ordered)")
    ev = ev.sort_values("onset").reset_index(drop=True)
    for k, n in CLASS_NAMES.items():
        print(f"[catalog] class {n}: {(ev.cls == k).sum()}")
    return ev


def nowcast_targets(series: StellaSeries, cfg):
    """y (T,2), w_train (T,2), w_eval (T,2) for targets [>=C, >=M].
    Positive [tb+5, tp]; don't-care [tb-5, tb+5); decay (tp, te] excluded from negatives.
    Priority when overlapping: positive > don't-care > decay > negative."""
    lab = cfg["labels"]
    g = series.minutes
    T = len(g)
    off, dc = float(lab["nowcast_positive_offset_min"]), float(lab["nowcast_dontcare_halfwidth_min"])
    ev = series.events
    tb, tp, te = (series.to_minutes(ev[c].to_numpy()) for c in ("onset", "peak", "end"))
    y = np.zeros((T, 2), np.float32)
    w_train = np.ones((T, 2), np.float32)
    w_eval = np.ones((T, 2), np.float32)
    for j, min_cls in enumerate((2, 3)):  # C, M
        prio = np.zeros(T, np.int8)  # 1 decay, 2 dont-care, 3 positive
        for b, p, e in zip(tb[ev.cls.to_numpy() >= min_cls], tp[ev.cls.to_numpy() >= min_cls],
                           te[ev.cls.to_numpy() >= min_cls]):
            def rng(lo, hi, lo_closed, hi_closed):
                a = np.searchsorted(g, lo, "left" if lo_closed else "right")
                z = np.searchsorted(g, hi, "right" if hi_closed else "left")
                return a, z
            a, z = rng(p, e, False, True)  # decay
            if z > a:
                prio[a:z] = np.maximum(prio[a:z], 1)
            a, z = rng(b - dc, b + dc, True, False)  # don't care
            if z > a:
                prio[a:z] = np.maximum(prio[a:z], 2)
            a, z = rng(b + off, p, True, True)  # positive (empty when rise <= offset)
            if z > a:
                prio[a:z] = 3
        y[:, j] = (prio == 3)
        w_train[:, j] = ((prio == 0) | (prio == 3))
        w_eval[:, j] = ((prio == 0) | (prio == 3) | ((prio == 1) & (not lab["eval_exclude_decay"])))
    return {"y": y, "w": w_train, "w_eval": w_eval}


def forecast_targets(series: StellaSeries, cfg):
    """y (T,4) for [>=B,>=C,>=M,>=X] = event onset in (t, t+H]; lead to earliest >=C onset; severity 0..4."""
    H = float(cfg["labels"]["horizon_min"])
    g = series.minutes
    T = len(g)
    ev = series.events
    onset = series.to_minutes(ev["onset"].to_numpy())
    cls = ev.cls.to_numpy()
    y = np.zeros((T, 4), np.float32)
    lead = np.full(T, np.nan, np.float32)
    for k in range(1, 5):
        on_k = np.sort(onset[cls >= k])
        if len(on_k) == 0:
            continue
        i = np.searchsorted(on_k, g, side="right")  # first onset strictly after t
        nxt = np.where(i < len(on_k), on_k[np.minimum(i, len(on_k) - 1)], np.inf)
        hit = nxt <= g + H
        y[:, k - 1] = hit
        if k == 2:
            lead = np.where(hit, nxt - g, np.nan).astype(np.float32)
    sev = y.sum(axis=1).astype(np.float32)  # nested -> max class in horizon (0 none, 1 B, ..., 4 X)
    lead_valid = np.isfinite(lead).astype(np.float32)
    return {"y": y, "lead": np.nan_to_num(lead, nan=0.0), "lead_valid": lead_valid, "sev": sev}


# ----------------------------------------------------------------------------- normalisation
@dataclass
class Normalizer:
    median: list
    scale: list
    clip: float

    def to_dict(self):
        return {"median": [float(v) for v in self.median], "scale": [float(v) for v in self.scale],
                "clip": float(self.clip)}

    @staticmethod
    def from_dict(d):
        return Normalizer(list(d["median"]), list(d["scale"]), float(d["clip"]))

    def apply(self, feats: np.ndarray) -> np.ndarray:
        x = np.array(feats, dtype=np.float32, copy=True)
        for c in CONTINUOUS_CHANNELS:
            z = (x[:, c] - self.median[c]) / self.scale[c]
            x[:, c] = np.clip(z, -self.clip, self.clip)
        spec0 = feats[:, 9] < 0.5
        hxr0 = feats[:, 10] < 0.5
        for c in SPECTRAL_DEPENDENT:
            x[spec0, c] = 0.0
        for c in HXR_DEPENDENT:
            x[hxr0, c] = 0.0
        return np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)


def fit_normalizer(series: StellaSeries, train_range, cfg) -> Normalizer:
    """Median / (IQR/1.349) per continuous channel from TRAINING-period rows only.
    Channels depending on a mask use only rows where that mask is 1."""
    start, end = train_range
    in_rng = (series.times >= start) & (series.times <= end) & ~series.bad
    F = series.features
    med, scale = [], []
    for c in CONTINUOUS_CHANNELS:
        m = in_rng & np.isfinite(F[:, c])
        if c in SPECTRAL_DEPENDENT:
            m &= F[:, 9] > 0.5
        if c in HXR_DEPENDENT:
            m &= F[:, 10] > 0.5
        v = F[m, c]
        if v.size < 10:
            raise ValueError(f"Too few training samples ({v.size}) to fit normalisation for {FEATURE_NAMES[c]}")
        q25, q50, q75 = np.percentile(v, [25, 50, 75])
        s = (q75 - q25) / 1.349
        if s < cfg["normalization"]["min_scale"]:
            warnings.warn(f"{FEATURE_NAMES[c]}: IQR scale ~0, using 1.0")
            s = 1.0
        med.append(float(q50))
        scale.append(float(s))
    return Normalizer(med, scale, float(cfg["normalization"]["clip"]))


# ----------------------------------------------------------------------------- datasets
def parse_range(cfg, name):
    r = cfg["data"]["splits"][name]
    out = []
    for s in r:
        t = pd.Timestamp(s)
        t = t.tz_convert("UTC").tz_localize(None) if t.tzinfo is not None else t
        out.append(t.to_datetime64().astype("datetime64[ns]"))
    return tuple(out)


def context_steps(cfg, kind):
    cad = float(cfg["data"]["cadence_minutes"])
    steps = float(cfg[kind]["context_minutes"]) / cad
    if abs(steps - round(steps)) > 1e-6:
        raise ValueError("context_minutes must be a multiple of cadence_minutes")
    return int(round(steps))


def window_end_indices(series, L, rng, horizon_min, max_imputed_frac, purge=True):
    start, end = rng
    end_eff = end - np.timedelta64(int(round(horizon_min * 60)), "s")
    ok = valid_windows(series.bad, series.sxr_imputed, L, max_imputed_frac)
    inr = (series.times >= start) & (series.times <= end_eff)
    ok &= inr
    if purge:
        shifted = np.zeros_like(inr)
        shifted[L - 1:] = inr[: len(inr) - L + 1]
        ok &= shifted
    return np.flatnonzero(ok)


class WindowDataset(Dataset):
    def __init__(self, x_norm, end_idx, L, arrays):
        self.x = x_norm
        self.end_idx = np.asarray(end_idx)
        self.L = L
        self.arrays = {k: torch.from_numpy(np.ascontiguousarray(v[self.end_idx])) for k, v in arrays.items()}
        self.any_pos = (self.arrays["y"].max(dim=1).values > 0).numpy()

    def __len__(self):
        return len(self.end_idx)

    def __getitem__(self, i):
        t = self.end_idx[i]
        xw = np.ascontiguousarray(self.x[t - self.L + 1: t + 1].T)  # (11, L)
        item = {"x": torch.from_numpy(xw)}
        for k, v in self.arrays.items():
            item[k] = v[i]
        return item


@dataclass
class SplitBundle:
    name: str
    dataset: WindowDataset
    end_idx: np.ndarray
    targets: dict  # full-length arrays over the grid


def make_splits(cfg, series, kind, normalizer, names, eval_mode=False):
    """eval_mode=False: training/validation windows (don't-care / decay samples removed for nowcaster).
    eval_mode=True: every valid window is kept so alarm runs stay contiguous for event metrics."""
    L = context_steps(cfg, kind)
    x_norm = normalizer.apply(series.features)
    H = float(cfg["labels"]["horizon_min"])
    if kind == "nowcaster":
        tg = nowcast_targets(series, cfg)
        arr_keys, horizon = ("y", "w"), 0.0
    else:
        tg = forecast_targets(series, cfg)
        arr_keys, horizon = ("y", "lead", "lead_valid", "sev"), H
    out = {}
    for n in names:
        idx = window_end_indices(series, L, parse_range(cfg, n), horizon, cfg["data"]["max_imputed_fraction"],
                                 cfg["data"]["purge_context"])
        if kind == "nowcaster" and not eval_mode:
            idx = idx[tg["w"][idx].sum(axis=1) > 0]
        ds = WindowDataset(x_norm, idx, L, {k: tg[k] for k in arr_keys})
        print(f"[data] {kind}/{n}: {len(idx)} windows, positives per head: "
              f"{ds.arrays['y'].sum(dim=0).int().tolist()}")
        out[n] = SplitBundle(n, ds, idx, tg)
    return out
