"""Shared FastAPI dependencies (store, settings, inference service)."""

from api.store import Store, get_store

__all__ = ["Store", "get_store"]
