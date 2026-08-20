# STELLA Architecture

**Solar Temporal Event Learning & Likelihood Assessment**

STELLA is a layered, two-stage AI pipeline:

```
Instrument Layer  ->  Feature & Decision Layer  ->  Model Layer  ->  Operations Layer
```

## Components

### 1. `api/` — FastAPI backend

- Application factory (`api/main.py`), CORS, `/ws/live` WebSocket stream.
- Routers (one per endpoint family): `status`, `timeseries`, `alerts`,
  `impact`, `explain`, `metrics`, `ingest`.
- Thread-safe in-memory store (`api/store.py`); swappable for a DB/Redis
  behind the same interface.
- Configuration via `STELLA_*` environment variables (`api/config.py`).

### 2. `pipeline/` — inference stack

| Module | Responsibility |
|--------|----------------|
| `ingest.py` | NOAA GOES + Aditya-L1 loaders, resampling, catalog |
| `features.py` | Neupert ratio, hardness, rise rate, rolling MAD, z-score |
| `thresholds.py` | MAD adaptive detection, B/C/M/X classes |
| `inference.py` | alert / watch / silent decision logic |
| `impact.py` | domain + India risk grid escalation |
| `evaluation.py` | POD / FAR / CSI / lead time |
| `models/` | Conv1D nowcaster, dilated-TCN forecaster, cascade |

### 3. `frontend/` — React dashboard

Vite dev server proxies `/api` and `/ws` to `:8000`. Panes: solar state,
nowcast, forecast, impact, metrics, alerts — driven by a WebSocket hook.

### 4. `scripts/` — data & training entrypoints

- `download_data.py` → GOES fixtures + Aditya-L1 staging
- `train_nowcaster.py` / `train_forecaster.py` (synthetic end-to-end)
- `evaluate.py` → `models/results.json`

## Data Flow

```
SoLEXS ─┐
        ├─> neupert_ratio ─┐
HEL1OS ─┘                  ├─> CascadePipeline ─> AlertDecision ─> FastAPI ─> Dashboard
GOES ──> transfer-learn ──┘        (Conv1D -> TCN)
```

## Failure Modes Tracked

- Ratio noise at quiet times → dampened by z-score + log features.
- Solar-cycle threshold drift → MAD-based rolling thresholds.
- Extreme data scarcity → GOES pre-train, Aditya-L1 fine-tune.
- Event-alignment vs per-minute accuracy → contingency metrics only.