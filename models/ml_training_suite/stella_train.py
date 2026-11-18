"""Train the STELLA nowcaster or forecaster.

  python stella_train.py --config stella_config.json --model nowcaster
  python stella_train.py --config stella_config.json --model forecaster
"""
from __future__ import annotations

import argparse
import json
import os
import random
import time

import numpy as np
import torch
from sklearn.metrics import average_precision_score
from torch.utils.data import DataLoader, Subset

from stella_data import context_steps, fit_normalizer, load_config, load_series, make_splits, parse_range
from stella_features import FEATURE_NAMES
from stella_model import build_model, lead_huber_loss, nested_bce, save_checkpoint


def set_seed(seed, deterministic=False):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    if deterministic:
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
        torch.use_deterministic_algorithms(True, warn_only=True)


def _worker_init(worker_id):
    s = torch.initial_seed() % 2 ** 32
    np.random.seed(s)
    random.seed(s)


def compute_loss(kind, out, batch, pos_weight, tcfg, horizon):
    if kind == "nowcaster":
        per_head = nested_bce(out["log_probs"], batch["y"], batch["w"], pos_weight)
        return per_head.sum()
    per_head = nested_bce(out["log_probs"], batch["y"], None, pos_weight)
    lead = lead_huber_loss(out["lead"], batch["lead"], batch["lead_valid"], horizon, tcfg["huber_delta"])
    return per_head.sum() + tcfg["lead_loss_weight"] * lead


def run_epoch(model, loader, kind, device, pos_weight, tcfg, horizon, optimizer=None):
    train = optimizer is not None
    model.train(train)
    tot, n = 0.0, 0
    probs, ys = [], []
    with torch.set_grad_enabled(train):
        for batch in loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            out = model(batch["x"])
            loss = compute_loss(kind, out, batch, pos_weight, tcfg, horizon)
            if train:
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                if tcfg["grad_clip"]:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), tcfg["grad_clip"])
                optimizer.step()
            else:
                probs.append(out["probs"].detach().cpu())
                ys.append(batch["y"].cpu())
            bs = batch["x"].shape[0]
            tot += float(loss.item()) * bs
            n += bs
    res = {"loss": tot / max(n, 1)}
    if not train and probs:
        p, y = torch.cat(probs).numpy(), torch.cat(ys).numpy()
        aps = []
        for k in range(p.shape[1]):
            aps.append(average_precision_score(y[:, k], p[:, k]) if 0 < y[:, k].sum() < len(y) else float("nan"))
        res["pr_auc"] = aps
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--model", required=True, choices=["nowcaster", "forecaster"])
    ap.add_argument("--out-dir", default="stella_runs")
    ap.add_argument("--device", default="auto", help="auto | cpu | cuda | cuda:0")
    ap.add_argument("--epochs", type=int)
    ap.add_argument("--batch-size", type=int)
    ap.add_argument("--lr", type=float)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    cfg = load_config(args.config)
    kind = args.model
    tcfg = cfg[kind]["train"]
    for a, k in (("epochs", "epochs"), ("batch_size", "batch_size"), ("lr", "lr")):
        if getattr(args, a) is not None:
            tcfg[k] = getattr(args, a)
    seed = args.seed if args.seed is not None else cfg["seed"]
    set_seed(seed, tcfg["deterministic"])
    device = torch.device("cuda" if (args.device == "auto" and torch.cuda.is_available()) else
                          ("cpu" if args.device == "auto" else args.device))
    print(f"[train] kind={kind} device={device} seed={seed}")

    series = load_series(cfg, use_cache=not args.no_cache)
    norm = fit_normalizer(series, parse_range(cfg, "train"), cfg)  # TRAIN period only
    bundles = make_splits(cfg, series, kind, norm, ["train", "val"])
    train_ds, val_ds = bundles["train"].dataset, bundles["val"].dataset
    if len(train_ds) == 0 or len(val_ds) == 0:
        raise SystemExit("Empty train or val set: check split dates, data coverage and window validity rules.")

    L = context_steps(cfg, kind)
    horizon = float(cfg["labels"]["horizon_min"])
    margs = dict(cfg[kind]["model"])
    margs["in_channels"] = len(FEATURE_NAMES)
    if kind == "forecaster":
        margs["max_lead_minutes"] = horizon
    model = build_model(kind, margs).to(device)
    print(f"[train] receptive field = {model.receptive_field} samples; context = {L} samples; "
          f"parameters = {sum(p.numel() for p in model.parameters())}")
    if L < model.receptive_field:
        print("[train] note: context is shorter than the receptive field (left side is zero-padded).")

    opt_name = tcfg["optimizer"].lower()
    params = model.parameters()
    if opt_name == "adam":
        opt = torch.optim.Adam(params, lr=tcfg["lr"], weight_decay=tcfg["weight_decay"])
    elif opt_name == "adamw":
        opt = torch.optim.AdamW(params, lr=tcfg["lr"], weight_decay=tcfg["weight_decay"])
    elif opt_name == "sgd":
        opt = torch.optim.SGD(params, lr=tcfg["lr"], weight_decay=tcfg["weight_decay"], momentum=0.9)
    else:
        raise ValueError(f"unknown optimizer {opt_name}")
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=tcfg["epochs"]) if tcfg["scheduler"] == "cosine" else None

    n_heads = 2 if kind == "nowcaster" else 4
    pw = tcfg["pos_weight"]
    pos_weight = None if pw is None else torch.tensor(pw if isinstance(pw, list) else [pw] * n_heads,
                                                       dtype=torch.float32)

    g = torch.Generator()
    g.manual_seed(seed)
    pin = device.type == "cuda"
    nw = int(tcfg["num_workers"])
    val_loader = DataLoader(val_ds, batch_size=tcfg["batch_size"], shuffle=False, num_workers=nw, pin_memory=pin)
    rng = np.random.default_rng(seed)

    os.makedirs(args.out_dir, exist_ok=True)
    best_path = os.path.join(args.out_dir, f"{kind}_best.pt")
    last_path = os.path.join(args.out_dir, f"{kind}_last.pt")
    history, best, bad_epochs = [], None, 0
    monitor = tcfg["monitor"]

    for epoch in range(1, int(tcfg["epochs"]) + 1):
        t0 = time.time()
        idx = np.arange(len(train_ds))
        frac = float(tcfg["negative_fraction"])
        if frac < 1.0:
            neg = idx[~train_ds.any_pos]
            keep_neg = rng.choice(neg, size=int(len(neg) * frac), replace=False) if len(neg) else neg
            idx = np.sort(np.concatenate([idx[train_ds.any_pos], keep_neg]))
        loader = DataLoader(Subset(train_ds, idx.tolist()), batch_size=tcfg["batch_size"], shuffle=True,
                            num_workers=nw, generator=g, worker_init_fn=_worker_init, pin_memory=pin)
        tr = run_epoch(model, loader, kind, device, pos_weight, tcfg, horizon, optimizer=opt)
        va = run_epoch(model, val_loader, kind, device, pos_weight, tcfg, horizon)
        if sched:
            sched.step()
        pr = va.get("pr_auc", [])
        mean_pr = float(np.nanmean(pr)) if len(pr) and not np.all(np.isnan(pr)) else 0.0
        score = va["loss"] if monitor == "val_loss" else -mean_pr
        metrics = {"train_loss": tr["loss"], "val_loss": va["loss"], "val_mean_pr_auc": mean_pr}
        for i, v in enumerate(pr):
            metrics[f"val_pr_auc_head{i}"] = None if np.isnan(v) else float(v)
        history.append({"epoch": epoch, **metrics})
        print(f"[epoch {epoch:03d}] train_loss={tr['loss']:.4f} val_loss={va['loss']:.4f} "
              f"val_pr_auc={['nan' if np.isnan(v) else round(float(v), 4) for v in pr]} ({time.time() - t0:.1f}s)")

        ck = dict(kind=kind, model=model, model_args=margs, normalizer_dict=norm.to_dict(), config=cfg,
                  epoch=epoch, metrics=metrics, context_steps=L, cadence_minutes=cfg["data"]["cadence_minutes"],
                  feature_names=FEATURE_NAMES, seed=seed)
        save_checkpoint(last_path, **ck)
        if best is None or score < best:
            best, bad_epochs = score, 0
            save_checkpoint(best_path, **ck)
            print(f"           saved best checkpoint -> {best_path}")
        else:
            bad_epochs += 1
            if tcfg["patience"] and bad_epochs >= tcfg["patience"]:
                print(f"[train] early stopping (no improvement for {bad_epochs} epochs)")
                break

    with open(os.path.join(args.out_dir, f"{kind}_history.json"), "w") as fh:
        json.dump(history, fh, indent=2)
    print(f"[train] done. best checkpoint: {best_path}")


if __name__ == "__main__":
    main()
