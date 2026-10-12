"""High-level inference: turn a flux window into an actionable alert."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from pipeline.models.cascade import CascadePipeline
from pipeline.thresholds import flare_class_float

from .features import adaptive_zscore, neupert_ratio
from .impact import AlertDecision


@dataclass
class InferenceResult:
    """Enriched result combining neural output with explainability stats."""

    decision: AlertDecision
    nowcast_prob: float = 0.0
    forecast_prob: float = 0.0
    lead_minutes: float = 0.0
    neupert_ratio_now: float = 0.0
    anomaly_zscore: float = 0.0
    feature_stats: dict[str, float] = field(default_factory=dict)


def run_inference(
    soft: np.ndarray,
    hard: np.ndarray,
    threshold_class: str = "M1.0",
    min_confidence: float = 0.5,
    lead_min: int = 30,
    cascade: CascadePipeline | None = None,
) -> InferenceResult:
    """Decide whether to raise an alert for the trailing flux window."""
    pipeline = cascade or CascadePipeline()
    result = pipeline.predict(soft, hard)

    threshold_magnitude = flare_class_float(threshold_class)
    flare_magnitude = flare_class_float(result.flare_class)
    above_floor = flare_magnitude >= threshold_magnitude * 0.1
    confident = max(result.nowcast_prob, result.forecast_prob) >= min_confidence

    if result.nowcast_prob >= min_confidence and above_floor:
        decision = AlertDecision.raise_alert(
            flare_class=result.flare_class,
            probability=float(result.forecast_prob),
            lead_minutes=float(result.lead_minutes or lead_min),
            nowcast=bool(result.nowcast_prob >= min_confidence),
        )
    elif confident:
        decision = AlertDecision.watch(
            probability=float(result.forecast_prob),
            lead_minutes=float(result.lead_minutes or lead_min),
        )
    else:
        decision = AlertDecision.silent(
            probability=float(result.forecast_prob),
            lead_minutes=float(result.lead_minutes or lead_min),
        )

    zscore = float(adaptive_zscore(soft)[-1])
    return InferenceResult(
        decision=decision,
        nowcast_prob=result.nowcast_prob,
        forecast_prob=result.forecast_prob,
        lead_minutes=result.lead_minutes,
        neupert_ratio_now=float(neupert_ratio(soft, hard)[-1]),
        anomaly_zscore=zscore,
        feature_stats={
            "soft_log": float(np.log10(np.maximum(soft[-1], 1e-10))),
            "hard_log": float(np.log10(np.maximum(hard[-1], 1e-10))),
        },
    )
