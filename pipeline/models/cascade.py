"""Cascade orchestrator: nowcaster (short window) -> forecaster (long context).

Each stage is specialised: the nowcaster is optimised for detection accuracy
(POD/FAR/CSI) on a short window, the forecaster for calibrated probability and
lead-time prediction on a longer context. The pipeline degrades to the
threshold-based classical detector when model checkpoints are absent.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.features import build_feature_frame
from pipeline.thresholds import detect_events

from .forecaster import Forecaster
from .nowcaster import Nowcaster


@dataclass
class CascadeResult:
    """One inference over a window of flux telemetry."""

    nowcast_prob: float
    forecast_prob: float
    lead_minutes: float
    flare_class: str
    method: str


class CascadePipeline:
    """Two-stage neural pipeline with a classical fallback."""

    def __init__(
        self,
        nowcaster: Nowcaster | None = None,
        forecaster: Forecaster | None = None,
    ) -> None:
        self.nowcaster = nowcaster
        self.forecaster = forecaster

    @classmethod
    def from_checkpoints(
        cls,
        nowcaster_path: str | Path,
        forecaster_path: str | Path,
        n_channels: int = 5,
    ) -> CascadePipeline:
        nowcaster, forecaster = None, None
        np_path = Path(nowcaster_path)
        if np_path.exists():
            nowcaster = Nowcaster(n_channels=n_channels)
            nowcaster.load_state_dict(__import__("torch").load(np_path, weights_only=True))
        fc_path = Path(forecaster_path)
        if fc_path.exists():
            forecaster = Forecaster(n_channels=n_channels)
            forecaster.load_state_dict(__import__("torch").load(fc_path, weights_only=True))
        return cls(nowcaster=nowcaster, forecaster=forecaster)

    def predict(self, soft: np.ndarray, hard: np.ndarray) -> CascadeResult:
        """Run the cascade, falling back to MAD-threshold event detection."""
        feats = build_feature_frame(soft, hard)
        if self.nowcaster is not None and self.forecaster is not None:
            import torch

            x = torch.from_numpy(feats.T[None, ...]).float()
            self.nowcaster.eval()
            self.forecaster.eval()
            with torch.no_grad():
                now = float(self.nowcaster(x).item())
                fc = self.forecaster(x)
                prob = float(fc[0, 0].item())
                lead = float(fc[0, 1].item())
            return CascadeResult(now, prob, lead, "M", "neural")

        events = detect_events(soft)
        now = 1.0 if events else 0.0
        return CascadeResult(now, float(now), 0.0, "M", "classical")
