"""Pydantic response/request schemas for every API endpoint."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["green", "yellow", "orange", "red"]


class SystemStatus(BaseModel):
    system: str = "Helios-Cortex"
    version: str
    solar_state: Literal["online", "degraded", "offline"]
    data_cache: str
    nowcast: str | None = None
    forecast_confidence: float | None = None
    lead_minutes: int | None = None


class TelemetryPoint(BaseModel):
    timestamp: datetime
    source: Literal["solexs", "hel1os", "goes"]
    soft_x_ray: float | None = None
    hard_x_ray: float | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class TimeseriesResponse(BaseModel):
    hours: int
    points: list[TelemetryPoint]


class NowcastResult(BaseModel):
    detected: bool
    magnitude: str | None = None
    confidence: float


class ForecastResult(BaseModel):
    probability: float
    lead_minutes: int
    flare_class: str | None = None


class Alert(BaseModel):
    id: str
    issued_at: datetime
    flare_class: str
    lead_minutes: int
    confidence: float
    status: Literal["active", "cleared"] = "active"


class FlareEvent(BaseModel):
    start_time: datetime
    peak_time: datetime
    end_time: datetime
    class_label: str
    source: Literal["noaa_goes", "aditya_l1"] = "noaa_goes"


class DomainsRisk(BaseModel):
    domain: str
    systems: list[str]
    risk: RiskLevel


class ImpactAssessment(BaseModel):
    flare_class: str
    lead_minutes: int
    domains: list[DomainsRisk]
    overall: RiskLevel


class IndiaRiskRow(BaseModel):
    state: str
    gps_risk: RiskLevel
    gic_risk: RiskLevel
    isro_station: str | None = None


class IndiaImpact(BaseModel):
    flare_class: str
    regions: list[IndiaRiskRow]


class FeatureImportance(BaseModel):
    feature: str
    importance: float
    interpretation: str


class ExplainResponse(BaseModel):
    flare_class: str
    features: list[FeatureImportance]


class MetricRow(BaseModel):
    metric: str
    m_class: float
    x_class: float
    industry_floor: float


class MetricsResponse(BaseModel):
    model: str = "helios-cortex-cascade"
    rows: list[MetricRow]


class IngestResponse(BaseModel):
    accepted: int
    latest: datetime
    preliminary: str | None = None
