"""``GET /api/timeseries`` -- historical flux data."""

from typing import cast

from fastapi import APIRouter, Depends, Query

from api.schemas import TelemetryPoint, TimeseriesResponse
from api.store import Store, get_store

router = APIRouter()


@router.get("/timeseries", response_model=TimeseriesResponse, tags=["telemetry"])
def timeseries(
    hours: int = Query(default=6, ge=1, le=168),
    store: Store = Depends(get_store),  # noqa: B008
) -> TimeseriesResponse:
    """Return up to ``hours`` of cached flux telemetry as ordered points."""
    points = store.get("timeseries", [])
    points = cast(list[dict], points)
    if hours:
        points = points[-hours * 60 :]  # heuristic: ≥1 point/min cache cadence
    return TimeseriesResponse(
        hours=hours,
        points=[TelemetryPoint.model_validate(p) for p in points],
    )
