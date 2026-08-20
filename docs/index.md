![Tiet Logo](assets/tiet-logo.svg){ .tiet-logo }

**UCS503: Software Engineering (Project)**  
**TIET Patiala**

# STELLA — Solar Temporal Event Learning & Likelihood Assessment

**Author(s):** The STELLA Team

## STELLA

> **The Sun never sleeps. Neither does STELLA.**
> *We watch. We learn. We warn. 30 minutes before impact.*

STELLA is a solar-flare early-warning research project that fuses Aditya-L1
(SoLEXS + HEL1OS) telemetry through the Neupert effect to forecast flare
probability and infrastructure impact 30-60 minutes before a flare reaches
Earth.

## Modules

| Module | Description |
|--------|-------------|
| `api/` | FastAPI backend — REST + WebSocket (`uvicorn api.main:app`) |
| `pipeline/` | Telemetry ingest, Neupert features, MAD thresholds, models, impact |
| `frontend/` | React (Vite) mission-control dashboard |
| `scripts/` | Data download, training, evaluation entrypoints |
| `docs/` | Research methodology and architecture writeups |

See the repository [README](../README.md) for the full project documentation.

## Quickstart

``` shell
pip install -e .[dev]
make api          # backend -> :8000/docs
make frontend     # dashboard -> :5173
```

## Documentation

- [Architecture](architecture.md)
- Written methodology and results: see the repository README and `docs/`.