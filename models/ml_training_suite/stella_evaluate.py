"""Evaluate a trained STELLA checkpoint on a split of your PRADAN data.

  python stella_evaluate.py --config stella_config.json --checkpoint stella_runs/nowcaster_best.pt --split test

Decision thresholds are chosen on the validation split (max F1 per head) unless --threshold is given.
Event metrics:
  nowcaster : event recall (alarm inside [onset+offset, peak]), detection delay, false-alarm episodes/day
  forecaster: event recall (alarm at some t with onset in (t, t+60]), warning time, false-alarm episodes/day
A false-alarm episode is a run of consecutive alarmed samples containing no positive (and, for the
nowcaster, no don't-care/decay) sample.
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import torch
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score
from torch.utils.data import DataLoader

from stella_data import Normalizer, load_config, load_series, make_splits
from stella_model import load_checkpoint

HEADS = {"nowcaster": ["C", "M"], "forecaster": ["B", "C", "M", "X"]}
HEAD_MIN_CLS = {"B": 1, "C": 2, "M": 3, "X": 4}


@torch.no_grad()
def predict(model, dataset, device, batch_size=1024):
    probs, leads = [], []
    for b in DataLoader(dataset, batch_size=batch_size, shuffle=False):
        out = model(b["x"].to(device))
        probs.append(out["probs"].cpu())
        if "lead" in out:
            leads.append(out["lead"].cpu())
    p = torch.cat(probs).numpy() if probs else np.zeros((0, 1))
    return p, (torch.cat(leads).numpy() if leads else None)


def choose_threshold(y, p, default):
    if y.sum() == 0 or y.sum() == len(y):
        return float(default)
    prec, rec, thr = precision_recall_curve(y, p)
    f1 = 2 * prec[:-1] * rec[:-1] / np.maximum(prec[:-1] + rec[:-1], 1e-12)
    return float(thr[int(np.argmax(f1))])


def binary_metrics(y, p, thr):
    pred = p >= thr
    tp = int((pred & (y == 1)).sum())
    fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum())
    prec = tp / (tp + fp) if tp + fp else float("nan")
    rec = tp / (tp + fn) if tp + fn else float("nan")
    f1 = 2 * prec * rec / (prec + rec) if (tp + fp and tp + fn and (prec + rec) > 0) else float("nan")
    ok = 0 < y.sum() < len(y)
    return {
        "n": int(len(y)), "n_pos": int(y.sum()), "threshold": float(thr),
        "precision": prec, "recall": rec, "f1": f1,
        "pr_auc": float(average_precision_score(y, p)) if ok else float("nan"),
        "roc_auc": float(roc_auc_score(y, p)) if ok else float("nan"),
        "brier": float(np.mean((p - y) ** 2)) if len(y) else float("nan"),
    }


def runs(mask):
    d = np.diff(np.concatenate([[0], mask.astype(np.int8), [0]]))
    return zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1))


def false_alarm_episodes(alarm, is_true_context):
    """is_true_context[i] True where an alarm would be legitimate/acceptable (positive, don't-care, decay)."""
    n_ep = n_fa = 0
    for s, e in runs(alarm):
        n_ep += 1
        if not is_true_context[s:e].any():
            n_fa += 1
    return n_ep, n_fa


def nowcast_event_metrics(series, pred_mask, alarm, y_k, w_k, min_cls, off_min):
    g = series.minutes
    ev = series.events[series.events.cls >= min_cls]
    tb, tp = series.to_minutes(ev["onset"].to_numpy()), series.to_minutes(ev["peak"].to_numpy())
    n_obs = n_det = 0
    delays = []
    for b, p in zip(tb, tp):
        a, z = np.searchsorted(g, b + off_min, "left"), np.searchsorted(g, p, "right")
        if z <= a or not pred_mask[a:z].any():
            continue  # event has no evaluated samples (outside split / invalid data)
        n_obs += 1
        hit = np.flatnonzero(alarm[a:z] & pred_mask[a:z])
        if hit.size:
            n_det += 1
            delays.append(g[a + hit[0]] - b)
    am = alarm & pred_mask
    legit = ~((y_k == 0) & (w_k > 0))  # positive, don't-care or (optionally) decay samples
    n_ep, n_fa = false_alarm_episodes(am, legit)
    days = pred_mask.sum() * series.cadence_min / 1440.0
    return {
        "events_evaluated": n_obs, "events_detected": n_det,
        "event_recall": n_det / n_obs if n_obs else float("nan"),
        "detection_delay_min_mean": float(np.mean(delays)) if delays else float("nan"),
        "detection_delay_min_median": float(np.median(delays)) if delays else float("nan"),
        "alarm_episodes": n_ep, "false_alarm_episodes": n_fa,
        "false_alarms_per_day": n_fa / days if days > 0 else float("nan"),
        "evaluated_days": float(days),
    }


def forecast_event_metrics(series, pred_mask, alarm, y_k, min_cls, H):
    g = series.minutes
    ev = series.events[series.events.cls >= min_cls]
    n_obs = n_det = 0
    warn = []
    for b in series.to_minutes(ev["onset"].to_numpy()):
        a, z = np.searchsorted(g, b - H, "left"), np.searchsorted(g, b, "left")  # t in [b-H, b)
        if z <= a or not pred_mask[a:z].any():
            continue
        n_obs += 1
        hit = np.flatnonzero(alarm[a:z] & pred_mask[a:z])
        if hit.size:
            n_det += 1
            warn.append(b - g[a + hit[0]])
    am = alarm & pred_mask
    n_ep, n_fa = false_alarm_episodes(am, y_k > 0)
    days = pred_mask.sum() * series.cadence_min / 1440.0
    return {
        "events_evaluated": n_obs, "events_detected": n_det,
        "event_recall": n_det / n_obs if n_obs else float("nan"),
        "warning_time_min_mean": float(np.mean(warn)) if warn else float("nan"),
        "warning_time_min_median": float(np.median(warn)) if warn else float("nan"),
        "alarm_episodes": n_ep, "false_alarm_episodes": n_fa,
        "false_alarms_per_day": n_fa / days if days > 0 else float("nan"),
        "evaluated_days": float(days),
    }


def _clean(o):
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--split", default="test", help="name of a split in data.splits")
    ap.add_argument("--threshold-split", default="val", help="split used to pick thresholds ('' = none)")
    ap.add_argument("--threshold", type=float, nargs="*", help="fixed threshold(s), one per head or one for all")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--out-dir", default="stella_runs")
    ap.add_argument("--batch-size", type=int, default=1024)
    ap.add_argument("--save-predictions", action="store_true")
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    device = torch.device("cuda" if (args.device == "auto" and torch.cuda.is_available()) else
                          ("cpu" if args.device == "auto" else args.device))
    cfg = load_config(args.config)
    model, ck = load_checkpoint(args.checkpoint, device)
    kind = ck["kind"]
    heads = HEADS[kind]
    if abs(ck["cadence_minutes"] - float(cfg["data"]["cadence_minutes"])) > 1e-9:
        raise SystemExit("cadence in config differs from the checkpoint's cadence")
    cfg[kind]["context_minutes"] = ck["context_steps"] * ck["cadence_minutes"]  # use training context
    norm = Normalizer.from_dict(ck["normalizer"])  # training-only statistics
    series = load_series(cfg, use_cache=not args.no_cache)
    H = float(cfg["labels"]["horizon_min"])

    names = [args.split] + ([args.threshold_split] if args.threshold_split and args.threshold_split != args.split else [])
    bundles = make_splits(cfg, series, kind, norm, names, eval_mode=True)

    # thresholds
    if args.threshold:
        thr = args.threshold if len(args.threshold) == len(heads) else [args.threshold[0]] * len(heads)
    elif args.threshold_split and args.threshold_split != args.split and len(bundles[args.threshold_split].end_idx):
        vb = bundles[args.threshold_split]
        vp, _ = predict(model, vb.dataset, device, args.batch_size)
        thr = []
        for k in range(len(heads)):
            y = vb.targets["y"][vb.end_idx, k]
            if kind == "nowcaster":
                m = vb.targets["w_eval"][vb.end_idx, k] > 0
                y, pk = y[m], vp[m, k]
            else:
                pk = vp[:, k]
            thr.append(choose_threshold(y, pk, cfg["evaluation"]["default_threshold"]))
        print(f"[eval] thresholds from '{args.threshold_split}': {dict(zip(heads, np.round(thr, 4)))}")
    else:
        thr = [cfg["evaluation"]["default_threshold"]] * len(heads)
        print(f"[eval] using default threshold {thr[0]}")

    b = bundles[args.split]
    if len(b.end_idx) == 0:
        raise SystemExit(f"No valid windows in split '{args.split}'")
    probs, lead = predict(model, b.dataset, device, args.batch_size)
    T = len(series.times)
    pred_mask = np.zeros(T, bool)
    pred_mask[b.end_idx] = True
    report = {"checkpoint": args.checkpoint, "kind": kind, "split": args.split,
              "thresholds": dict(zip(heads, [float(t) for t in thr])), "heads": {}}

    for k, h in enumerate(heads):
        y_full = b.targets["y"][:, k]
        y = y_full[b.end_idx]
        if kind == "nowcaster":
            w_full = b.targets["w_eval"][:, k]
            m = w_full[b.end_idx] > 0
            sample = binary_metrics(y[m], probs[m, k], thr[k])
        else:
            sample = binary_metrics(y, probs[:, k], thr[k])
        alarm = np.zeros(T, bool)
        alarm[b.end_idx] = probs[:, k] >= thr[k]
        if kind == "nowcaster":
            ev = nowcast_event_metrics(series, pred_mask, alarm, y_full, w_full, HEAD_MIN_CLS[h],
                                       cfg["evaluation"]["detect_window_start_offset_min"])
        else:
            ev = forecast_event_metrics(series, pred_mask, alarm, y_full, HEAD_MIN_CLS[h], H)
        report["heads"][f">={h}"] = {"sample": sample, "event": ev}

    if kind == "forecaster":
        lv = b.targets["lead_valid"][b.end_idx] > 0
        if lv.any():
            err = lead[lv] - b.targets["lead"][b.end_idx][lv]
            report["lead_time_minutes"] = {"n": int(lv.sum()), "mae": float(np.abs(err).mean()),
                                           "rmse": float(np.sqrt((err ** 2).mean())),
                                           "median_abs_error": float(np.median(np.abs(err))),
                                           "bias": float(err.mean())}
        sev = b.targets["sev"][b.end_idx]
        names_sev = ["none", "B", "C", "M", "X"]
        report["by_max_class_in_horizon"] = {
            names_sev[s]: {"n": int((sev == s).sum()),
                           **{f"mean_p_{h}": float(probs[sev == s, k].mean()) if (sev == s).any() else None
                              for k, h in enumerate(heads)}}
            for s in range(5)}

    os.makedirs(args.out_dir, exist_ok=True)
    stem = f"{kind}_{args.split}_eval"
    with open(os.path.join(args.out_dir, stem + ".json"), "w") as fh:
        json.dump(_clean(report), fh, indent=2)
    if args.save_predictions:
        import pandas as pd
        df = pd.DataFrame({"time": series.times[b.end_idx]})
        for k, h in enumerate(heads):
            df[f"p_{h}"] = probs[:, k]
            df[f"y_{h}"] = b.targets["y"][b.end_idx, k]
        if lead is not None:
            df["lead_pred_min"] = lead
            df["lead_true_min"] = np.where(b.targets["lead_valid"][b.end_idx] > 0, b.targets["lead"][b.end_idx], np.nan)
        df.to_csv(os.path.join(args.out_dir, stem + "_predictions.csv"), index=False)

    print(json.dumps(_clean(report), indent=2))
    print(f"[eval] report saved: {os.path.join(args.out_dir, stem + '.json')}")


if __name__ == "__main__":
    main()
