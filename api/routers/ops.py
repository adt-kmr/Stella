"""Operator-facing operations endpoints.

New surface (mounted under ``/api/ops``) that condenses the live pipeline
state into a single briefing call, plus a lightweight runtime summary. Both
degrade gracefully when no snapshot has been published yet.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends

from api.store import Store, get_store
from pipeline.ops import build_briefing, build_runtime

router = APIRouter(prefix="/ops", tags=["operations"])

_STARTED_AT = time.monotonic()


@router.get("/briefing")
def operator_briefing(store: Store = Depends(get_store)) -> dict:  # noqa: B008
    """One-call digest of the current solar state for on-console operators."""
    return build_briefing(store.latest())


@router.get("/runtime")
def operator_runtime(store: Store = Depends(get_store)) -> dict:  # noqa: B008
    """Uptime, buffer occupancy and pipeline latency for operators."""
    return build_runtime(
        store.latest(),
        uptime_seconds=time.monotonic() - _STARTED_AT,
        buffered_points=int(store.get("buffered_points", 0) or 0),
        buffered_alerts=int(store.get("buffered_alerts", store.alert_count()) or 0),
    )
