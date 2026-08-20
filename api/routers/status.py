"""``GET /api/status`` -- live telemetry + system health."""

from fastapi import APIRouter, Depends

from api.config import settings
from api.schemas import SystemStatus
from api.store import Store, get_store, now_iso

router = APIRouter()


@router.get("/status", response_model=SystemStatus, tags=["telemetry"])
def system_status(store: Store = Depends(get_store)) -> SystemStatus:  # noqa: B008
    """Report solar-state health, data-cache status and latest inference."""
    latest = store.latest() or {}
    return SystemStatus(
        version=settings.app_version,
        solar_state="online",
        data_cache=now_iso() if latest else "empty",
        nowcast=latest.get("flare_class"),
        forecast_confidence=latest.get("forecast_confidence"),
        lead_minutes=latest.get("lead_minutes", settings.alert_lead_min),
    )
