# Models

Trained model weights live here. Checkpoints are **gitignored by design** —
they are large, machine-generated artifacts that can always be regenerated:

```bash
python scripts/train_nowcaster.py --out models/nowcaster.pt
python scripts/train_forecaster.py --out models/forecaster.pt
```

| File | Description |
|------|-------------|
| `nowcaster.pt` | Conv1D CNN — binary flare detection (POD/FAR/CSI) |
| `forecaster.pt` | Dilated TCN — P(flare) + lead-time forecasting |
| `results.json` | Latest evaluation summary served by `/api/metrics` |
| `README.md` | This file |

The models are consumed by `pipeline/models/cascade.py`,
`api/routers/metrics.py`, and the dashboard.

## Bundled tooling

| Directory | Contents |
|-----------|----------|
| `ml_training_suite/` | Standalone PyTorch training toolkit: example config, data loading/normalisation, causal feature engineering (11 channels), Conv1D nowcaster + dilated TCN forecaster definitions, and training/evaluation scripts. |
| `pradan_acquisition/` | PRADAN (ISRO ISSDC) acquisition layer: configuration-driven downloader with ingest/verify/status/inspect commands, example config and credential template, a local fake-server test harness, and the verification report detailing what was and was not validated against the live portal. |

These directories contain source and documentation only. Generated checkpoints
(`*.pt`) and downloaded satellite data remain gitignored.