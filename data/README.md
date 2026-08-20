# Data

Raw satellite telemetry and processed feature files. This directory is
**gitignored by design** — everything here is regenerable:

```bash
python scripts/download_data.py        # GOES flare list + flux snapshot
```

## Layout

```
data/
├── raw/
│   ├── goes/          # NOAA GOES JSON: flare list, 6h flux
│   └── aditya_l1/     # SoLEXS + HEL1OS CSVs (staged; science data pending)
├── interim/           # cleaned/reshaped views (created by notebooks/scripts)
└── processed/         # flare_catalog.csv, flux.csv — consumed by the API
```

## Sources

- **NOAA GOES** — continuous X-ray flux + flare event list since 1995
  (the 28+ year pre-training corpus for transfer learning).
- **ISRO Aditya-L1** — SoLEXS (soft X-ray, thermal) + HEL1OS (hard X-ray,
  non-thermal) are the two-instrument fusion stage. Science data not yet
  public; `data/raw/aditya_l1/README.md` explains the expected format.