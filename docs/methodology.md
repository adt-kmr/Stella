# STELLA Methodology

> **Solar Temporal Event Learning & Likelihood Assessment — Helios-Cortex**

STELLA detects and forecasts solar flares *before their photon front reaches
Earth* by fusing two Aditya-L1 instruments through the Neupert effect,
transfer-learning from 28+ years of NOAA GOES data, and escalating impact
across an India-specific risk grid.

This document is written phase-by-phase as the project progresses.

---

## The Physics of Early Warning

A flare releases energy across the electromagnetic spectrum at different
times. In the standard (Neupert, 1968) picture:

- **HEL1OS** — hard X-rays, non-thermal, emitted during the *impulsive* phase → **peaks first**.
- **SoLEXS** — soft X-rays, thermal, emitted during the *gradual* phase → **rises later**.

The ratio of hard-to-soft flux therefore leads any single-channel soft-X-ray
detector by the impulsive-to-gradual delay, tens of minutes.

```
ratio(t) = HEL1OS(t) / max(SoLEXS(t), floor)
```

See `pipeline/features.py` for the exact implementation (`neupert_ratio`,
`spectral_hardness`, `flux_rise_rate`, `adaptive_zscore`).

## The Pipeline

1. **Ingest** — NOAA GOES + Aditya-L1 flux and flare catalogs
   (`pipeline/ingest.py`, `scripts/download_data.py`).
2. **Detect** — Conv1D nowcaster + MAD adaptive threshold
   (`pipeline/models/nowcaster.py`, `pipeline/thresholds.py`).
3. **Forecast** — dilated TCN ahead of the current window
   (`pipeline/models/forecaster.py`).
4. **Decide** — alert / watch / silent from probability, magnitude, and lead
   (`pipeline/inference.py`).
5. **Assess** — 7-domain infrastructure risk + 34-state/UT India grid
   (`pipeline/impact.py`).
6. **Serve** — FastAPI REST + WebSocket (`api/`) feeding the React dashboard.

## Validation

Event-level contingency metrics (Hayes et al., 2017): POD / FAR / CSI and
mean lead time (`pipeline/evaluation.py`). Industry floors: POD ≥ 0.80,
FAR ≤ 0.35, CSI ≥ 0.50, lead ≥ 15 min. Targets for the cascade: M-class
POD 0.94 / FAR 0.21 / CSI 0.78 at +28 min; X-class POD 0.97 / FAR 0.12 /
CSI 0.86 at +42 min. Real figures are written to `models/results.json`.

## Status

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundations & scaffolding | In progress |
| 1 | Data & telemetry | In progress |
| 2 | Nowcaster (detection) | Model live, validation pending |
| 3 | Forecaster (lead time) | Model live, validation pending |
| 4 | Impact & explainability | Implemented |
| 5 | Live operations & paper | Scaffolded |

Aditya-L1 science data is not yet public; until then the models are trained
and scored on GOES and synthetic windows. This is documented as a first-class
limitation across README, docs, and results.