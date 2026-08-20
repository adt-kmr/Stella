"""``GET /api/metrics`` -- model validation metrics.

Values are the design targets the system is validated against. Once a model
is trained, a real evaluation run (``scripts/evaluate.py``) writes
``results/metrics.json`` which this endpoint serves in preference to targets.
"""

import json
from pathlib import Path

from fastapi import APIRouter
from pydantic import TypeAdapter

from api.config import settings
from api.schemas import MetricRow, MetricsResponse

router = APIRouter()

TARGETS: list[MetricRow] = TypeAdapter(list[MetricRow]).validate_python(
    [
        {"metric": "POD", "m_class": 0.94, "x_class": 0.97, "industry_floor": 0.80},
        {"metric": "FAR", "m_class": 0.21, "x_class": 0.12, "industry_floor": 0.35},
        {"metric": "CSI", "m_class": 0.78, "x_class": 0.86, "industry_floor": 0.50},
        {"metric": "Lead Time (min)", "m_class": 28.0, "x_class": 42.0, "industry_floor": 15.0},
    ]
)


@router.get("/metrics", response_model=MetricsResponse, tags=["validation"])
def metrics() -> MetricsResponse:
    """Validation metrics (targets until a trained run publishes results)."""
    results_path: Path = settings.models_root / "results.json"
    if results_path.exists():
        with results_path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return MetricsResponse.model_validate(data)
    return MetricsResponse(rows=TARGETS)
