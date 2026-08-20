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