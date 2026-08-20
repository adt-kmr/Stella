"""``GET /api/alerts`` + ``GET /api/catalog`` -- alerts and flare history."""

from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import TypeAdapter

from api.config import settings
from api.schemas import Alert, FlareEvent
from api.store import Store, get_store

router = APIRouter()


@router.get("/alerts", response_model=list[Alert], tags=["alerts"])
def alerts(store: Store = Depends(get_store)) -> list[Alert]:  # noqa: B008
    """Recent flares flagged by the cascaded nowcaster + forecaster."""
    raw = store.recent_alerts(limit=20)
    return TypeAdapter(list[Alert]).validate_python(raw)


@router.get("/catalog", response_model=list[FlareEvent], tags=["alerts"])
def catalog() -> list[FlareEvent]:
    """Historical flare catalog (NOAA GOES + Aditya-L1) from processed cache."""
    path: Path = settings.data_root / "processed" / "flare_catalog.csv"
    if not path.exists():
        return []
    import pandas as pd

    df = pd.read_csv(path)
    return TypeAdapter(list[FlareEvent]).validate_python(df.to_dict("records"))
