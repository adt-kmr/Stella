"""Background auto-retrain scheduler.

Kicks off a low-priority daemon thread that periodically re-fits the cascade
on freshly fetched telemetry. The scheduler is deliberately dependency-free:
the default trainer is a lightweight placeholder until real checkpoints are
wired in, so importing the API never blocks on training.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable

logger = logging.getLogger("stella.auto_train")

Trainer = Callable[[int, float], None]

MIN_INTERVAL_SECONDS = 60.0


def _default_trainer(epochs: int, lr: float) -> None:
    """Placeholder trainer used until trained checkpoints are configured."""
    logger.info("auto-retrain tick (epochs=%s, lr=%s) - no checkpoint configured", epochs, lr)


class AutoRetrainScheduler:
    """Periodic, daemonised retrain loop with explicit start/stop control."""

    def __init__(
        self,
        interval_hours: float = 6.0,
        epochs: int = 30,
        lr: float = 1e-3,
        trainer: Trainer | None = None,
    ) -> None:
        self.interval_seconds = max(MIN_INTERVAL_SECONDS, float(interval_hours) * 3600.0)
        self.epochs = int(epochs)
        self.lr = float(lr)
        self._trainer = trainer or _default_trainer
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    @property
    def running(self) -> bool:
        """True while the background thread is alive."""
        return self._thread is not None and self._thread.is_alive()

    def _loop(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            try:
                self._trainer(self.epochs, self.lr)
            except Exception:  # pragma: no cover - defensive
                logger.exception("auto-retrain tick failed")

    def start(self) -> AutoRetrainScheduler:
        """Start the loop once; safe to call repeatedly."""
        if self.running:
            return self
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="stella-auto-train", daemon=True)
        self._thread.start()
        logger.info("auto-retrain scheduler started (every %.1f h)", self.interval_seconds / 3600)
        return self

    def stop(self, timeout: float = 5.0) -> None:
        """Signal the loop to stop and join the thread."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout)
            self._thread = None


_scheduler: AutoRetrainScheduler | None = None


def start_auto_retrain(
    interval_hours: float = 6.0,
    epochs: int = 30,
    lr: float = 1e-3,
    trainer: Trainer | None = None,
) -> AutoRetrainScheduler:
    """Start (once) and return the module-level auto-retrain scheduler."""
    global _scheduler
    if _scheduler is None or not _scheduler.running:
        _scheduler = AutoRetrainScheduler(interval_hours, epochs, lr, trainer).start()
    return _scheduler


def stop_auto_retrain() -> None:
    """Stop the module-level scheduler if it is running."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.stop()
        _scheduler = None
