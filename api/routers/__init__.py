"""API route modules (one per documented endpoint family)."""

from . import alerts, explain, impact, ingest, meta, metrics, ops, status, timeseries

routers = [
    status.router,
    timeseries.router,
    alerts.router,
    impact.router,
    explain.router,
    metrics.router,
    ingest.router,
    meta.router,
    ops.router,
]

__all__ = ["routers"]
