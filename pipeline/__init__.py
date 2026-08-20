"""STELLA / Helios-Cortex inference pipeline.

Telemetry ingest, Neupert-effect feature engineering, adaptive thresholding,
Conv1D nowcaster + dilated-TCN forecaster, impact assessment and evaluation.

Modules in this package are numpy-only (no PyTorch) except ``models/``,
which import ``torch`` lazily.
"""

__version__ = "0.1.0"
