"""Application configuration, loaded from environment / ``.env``.

Every ``STELLA_*`` variable is namespaced via :class:`pydantic_settings.BaseSettings`.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Runtime settings for the Helios-Cortex API and inference stack."""

    model_config = SettingsConfigDict(
        env_prefix="STELLA_",
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Helios-Cortex"
    app_version: str = "0.1.0"
    debug: bool = False

    data_root: Path = PROJECT_ROOT / "data"
    models_root: Path = PROJECT_ROOT / "models"

    nowcaster_ckpt: Path = PROJECT_ROOT / "models" / "nowcaster.pt"
    forecaster_ckpt: Path = PROJECT_ROOT / "models" / "forecaster.pt"

    alert_lead_min: int = 30
    flare_threshold_class: str = "M1.0"
    cascade_min_confidence: float = 0.5


settings = Settings()
