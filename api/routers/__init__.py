"""API route modules (one per documented endpoint family)."""

from . import alerts, explain, impact, ingest, metrics, status, timeseries

routers = [
    status.router,
    timeseries.router,
    alerts.router,
    impact.router,
    explain.router,
    metrics.router,
    ingest.router,
]

__all__ = ["routers"]
