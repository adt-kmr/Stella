"""In-memory telemetry and alert store.

A thread-safe, zero-dependency store used while the API runs.
Swap for Redis / TimescaleDB for production by satisfying the same
thin interface (``get``, ``set``, ``push_alert``, ``alerts``).
"""

from datetime import UTC, datetime
from threading import Lock
from typing import Any


class Store:
    """Minimal key/value telemetry store with an append-only alert buffer."""

    def __init__(self, max_alerts: int = 200) -> None:
        self._lock = Lock()
        self._kv: dict[str, Any] = {}
        self._alerts: list[dict[str, Any]] = []
        self._max_alerts = max_alerts

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._kv[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._kv.get(key, default)

    def setdefault(self, key: str, default: Any) -> Any:
        with self._lock:
            return self._kv.setdefault(key, default)

    def push_alert(self, alert: dict[str, Any]) -> None:
        with self._lock:
            self._alerts.append(alert)
            if len(self._alerts) > self._max_alerts:
                self._alerts = self._alerts[-self._max_alerts :]

    def recent_alerts(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            return list(reversed(self._alerts[-limit:]))

    def latest(self) -> dict[str, Any] | None:
        return self.get("latest")


store = Store()


def get_store() -> Store:
    """FastAPI dependency returning the shared store instance."""
    return store


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
