"""Event-based evaluation metrics: POD / FAR / CSI and lead time.

Standard contingency-table scores (Hayes et al., 2017) for flare forecasting,
computed only at the event level so the numbers line up with the operational
validation table in the README (M-class, X-class separate).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Contingency:
    """2x2 contingency counts for a binary event forecast."""

    hits: int = 0
    misses: int = 0
    false_alarms: int = 0
    correct_null: int = 0


@dataclass
class EventScores:
    """Aggregate scores for a model run."""

    pod: float = 0.0
    far: float = 0.0
    csi: float = 0.0
    mean_lead_minutes: float = 0.0
    contingency: Contingency = field(default_factory=Contingency)


def contingency_table(predicted: np.ndarray, observed: np.ndarray) -> Contingency:
    """Count hits / misses / false alarms / correct nulls from bool arrays."""
    p = np.asarray(predicted, dtype=bool)
    o = np.asarray(observed, dtype=bool)
    return Contingency(
        hits=int((p & o).sum()),
        misses=int((~p & o).sum()),
        false_alarms=int((p & ~o).sum()),
        correct_null=int((~p & ~o).sum()),
    )


def pod(cont: Contingency) -> float:
    """Probability of detection: hits / (hits + misses)."""
    denom = cont.hits + cont.misses
    return cont.hits / denom if denom else 0.0


def far(cont: Contingency) -> float:
    """False alarm ratio: false_alarms / (hits + false_alarms)."""
    denom = cont.hits + cont.false_alarms
    return cont.false_alarms / denom if denom else 0.0


def csi(cont: Contingency) -> float:
    """Critical success index: hits / (hits + misses + false_alarms)."""
    denom = cont.hits + cont.misses + cont.false_alarms
    return cont.hits / denom if denom else 0.0


def lead_time(alert_times: np.ndarray, event_times: np.ndarray) -> float:
    """Mean lead time (minutes) from alert issue to event onset (max(0))."""
    if len(alert_times) == 0 or len(event_times) == 0:
        return 0.0
    arr = (
        np.abs(np.asarray(alert_times, dtype=float))[:, None]
        - np.abs(np.asarray(event_times, dtype=float))[None, :]
    )
    best = np.abs(arr).min(axis=1)
    return float(np.clip(best, 0.0, None).mean())


def score_run(
    predicted: np.ndarray,
    observed: np.ndarray,
    alert_times: np.ndarray | None = None,
    event_times: np.ndarray | None = None,
) -> EventScores:
    """Bundle the contingency scores plus mean lead time for a run."""
    cont = contingency_table(predicted, observed)
    return EventScores(
        pod=pod(cont),
        far=far(cont),
        csi=csi(cont),
        mean_lead_minutes=(
            lead_time(alert_times, event_times)
            if alert_times is not None and event_times is not None
            else 0.0
        ),
        contingency=cont,
    )
