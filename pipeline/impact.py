"""Impact assessment: infrastructure domains + India regional risk grid.

Risk is derived deterministically from the detected flare class and the
forecast lead time, so every call is reproducible and unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .thresholds import flare_class_float

Risk = Literal["green", "yellow", "orange", "red"]
RISK_ORDER = ("green", "yellow", "orange", "red")

# India table uses Low/Medium/High wording; map to the color scale used
# throughout the risk grid so it stays consistent with domain risk levels.
_RISK_LABELS = {"low": "yellow", "medium": "orange", "high": "red"}

DOMAINS: list[dict] = [
    {"domain": "Navigation", "systems": ["GPS", "NavIC", "GAGAN"]},
    {"domain": "Communications", "systems": ["INSAT", "GSAT", "SATCOM"]},
    {"domain": "Defence", "systems": ["Recon Satellites", "OTH Radar"]},
    {"domain": "Weather", "systems": ["INSAT-3D", "Oceansat"]},
    {"domain": "Power Grid", "systems": ["HV Transformers", "SCADA"]},
    {"domain": "Space Station", "systems": ["ISS", "Gaganyaan"]},
    {"domain": "Instruments", "systems": ["Aditya-L1", "JWST"]},
]

INDIA_REGIONS: list[dict] = [
    {"state": "Karnataka", "gps_risk": "low", "gic_risk": "medium", "isro_station": "SDSC-SHAR"},
    {"state": "Tamil Nadu", "gps_risk": "medium", "gic_risk": "high", "isro_station": "URSC"},
    {"state": "Kerala", "gps_risk": "low", "gic_risk": "medium", "isro_station": "VSSC"},
    {"state": "Gujarat", "gps_risk": "high", "gic_risk": "high", "isro_station": "SAC"},
    {
        "state": "Andhra Pradesh",
        "gps_risk": "medium",
        "gic_risk": "high",
        "isro_station": "SDSC-SHAR",
    },
    {"state": "Maharashtra", "gps_risk": "medium", "gic_risk": "medium", "isro_station": None},
    {"state": "Uttarakhand", "gps_risk": "high", "gic_risk": "low", "isro_station": "HSFC"},
    {"state": "Rajasthan", "gps_risk": "high", "gic_risk": "low", "isro_station": None},
]


@dataclass
class AlertDecision:
    """Structured alert decision raised by :func:`pipeline.inference.run_inference`."""

    status: Literal["alert", "watch", "silent"]
    flare_class: str
    probability: float
    lead_minutes: float
    nowcast: bool = False

    @classmethod
    def raise_alert(
        cls,
        flare_class: str,
        probability: float,
        lead_minutes: float,
        nowcast: bool,
    ) -> AlertDecision:
        return cls("alert", flare_class, probability, lead_minutes, nowcast)

    @classmethod
    def watch(cls, probability: float, lead_minutes: float) -> AlertDecision:
        return cls("watch", "B", probability, lead_minutes, False)

    @classmethod
    def silent(cls, probability: float, lead_minutes: float) -> AlertDecision:
        return cls("silent", "B", probability, lead_minutes, False)


def _boost(flare_class: str, lead_minutes: float) -> int:
    magnitude = flare_class_float(flare_class)
    boost = 0
    if magnitude >= 1.0:
        boost += 1
    if magnitude >= 10.0:
        boost += 1
    if lead_minutes >= 30:
        boost += 1
    return boost


def domain_risks(flare_class: str, lead_minutes: float) -> list[dict]:
    """Risk per monitored domain for a flare scenario."""
    boost = _boost(flare_class, lead_minutes)
    return [
        {
            "domain": d["domain"],
            "systems": d["systems"],
            "risk": RISK_ORDER[min(boost, 3)],
        }
        for d in DOMAINS
    ]


def india_risks(flare_class: str) -> list[dict]:
    """Per-region GPS + GIC risk (Low/Medium/High baselines, upgraded by flare class)."""
    magnitude = flare_class_float(flare_class)
    step = min(int(magnitude >= 1.0) + int(magnitude >= 10.0), 2)
    out = []
    for r in INDIA_REGIONS:
        gps = RISK_ORDER[min(RISK_ORDER.index(_RISK_LABELS[r["gps_risk"]]) + step, 3)]
        gic = RISK_ORDER[min(RISK_ORDER.index(_RISK_LABELS[r["gic_risk"]]) + step, 3)]
        out.append(
            {
                "state": r["state"],
                "gps_risk": gps,
                "gic_risk": gic,
                "isro_station": r.get("isro_station"),
            }
        )
    return out
