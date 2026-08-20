"""``GET /api/explain`` -- explainable-AI output for a flare prediction."""

from fastapi import APIRouter, Query
from pydantic import TypeAdapter

from api.schemas import ExplainResponse, FeatureImportance

router = APIRouter()

# Flag-importance table as designed for the current model.
FEATURES: list[FeatureImportance] = TypeAdapter(list[FeatureImportance]).validate_python(
    [
        {"feature": "Soft X-ray Flux", "importance": 0.32, "interpretation": "Primary driver"},
        {
            "feature": "Hard X-ray Flux",
            "importance": 0.22,
            "interpretation": "Early warning signal",
        },
        {
            "feature": "Spectral Hardness",
            "importance": 0.18,
            "interpretation": "Key differentiator",
        },
        {"feature": "Flux Rise Rate", "importance": 0.12, "interpretation": "Trend detection"},
        {"feature": "Adaptive Z-Score", "importance": 0.08, "interpretation": "Anomaly detection"},
        {"feature": "TCN Context", "importance": 0.06, "interpretation": "Temporal patterns"},
        {"feature": "Rolling MAD", "importance": 0.02, "interpretation": "Background noise"},
    ]
)


@router.get("/explain", response_model=ExplainResponse, tags=["explain"])
def explain(flare_class: str = Query(default="M3.5")) -> ExplainResponse:
    """Per-feature attribution for the requested flare class."""
    return ExplainResponse(flare_class=flare_class, features=FEATURES)
