"""System-metadata endpoints: health, build info and static references.

These re-home the probe/reference routes that previously lived inline in the
legacy app module, now served from the modular router tree so they can be
reused and tested independently of the live dashboard surface.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from api.config import settings
from api.store import Store, get_store

router = APIRouter(tags=["metadata"])


@router.get("/health")
def health(store: Store = Depends(get_store)) -> dict:  # noqa: B008
    """Lightweight readiness probe for load balancers and uptime checks."""
    latest = store.latest()
    return {
        "status": "ok" if latest is not None else "initializing",
        "service": settings.app_name.lower(),
        "pipeline": "live" if latest is not None else "warming-up",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/version")
def version(store: Store = Depends(get_store)) -> dict:  # noqa: B008
    """Build and schema version reported by the running service."""
    latest = store.latest() or {}
    return {
        "service": settings.app_name,
        "appVersion": settings.app_version,
        "modelVersion": latest.get("modelVersion", settings.app_version),
        "apiSurface": "v1",
    }
