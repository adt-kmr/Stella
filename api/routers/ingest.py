"""``POST /api/update`` -- push telemetry from instrument pipelines."""

from fastapi import APIRouter, Depends
from pydantic import TypeAdapter

from api.schemas import IngestResponse, TelemetryPoint
from api.store import Store, get_store
from pipeline.features import soft_flare_level
from pipeline.thresholds import classify_flare

router = APIRouter()


@router.post("/update", response_model=IngestResponse, tags=["ingest"])
def update(
    points: list[TelemetryPoint], store: Store = Depends(get_store)  # noqa: B008
) -> IngestResponse:
    """Accept a batch of flux telemetry, cache it, and run a lightweight check."""
    draft: list[dict] = [p.model_dump(mode="json") for p in points]
    cached: list[dict] = store.get("timeseries", [])
    cached.extend(draft)
    store.set("timeseries", cached[-100_000:])

    soft = [p.soft_x_ray for p in points if p.soft_x_ray is not None]
    preliminary = None
    if soft:
        level = soft_flare_level(soft[-1])
        preliminary = classify_flare(level)

    latest = cached[-1]
    store.set("latest", latest)
    return IngestResponse(
        accepted=len(points),
        latest=TypeAdapter(TelemetryPoint).validate_python(latest).timestamp,
        preliminary=preliminary,
    )
