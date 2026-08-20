"""``GET /api/impact`` + ``GET /api/india-impact`` -- impact assessment."""

from fastapi import APIRouter, Query

from api.schemas import DomainsRisk, ImpactAssessment, IndiaImpact, IndiaRiskRow
from pipeline.impact import domain_risks, india_risks

router = APIRouter()


@router.get("/impact", response_model=ImpactAssessment, tags=["impact"])
def impact(
    flare_class: str = Query(default="M3.5"),
    lead_minutes: int = Query(default=30, ge=0),
) -> ImpactAssessment:
    """Infrastructure risk across critical domains for a flare scenario."""
    domains = domain_risks(flare_class, lead_minutes)
    overall = max((d["risk"] for d in domains), key=_risk_rank)
    return ImpactAssessment(
        flare_class=flare_class,
        lead_minutes=lead_minutes,
        domains=[DomainsRisk.model_validate(d) for d in domains],
        overall=overall,
    )


@router.get("/india-impact", response_model=IndiaImpact, tags=["impact"])
def india_impact(flare_class: str = Query(default="M3.5")) -> IndiaImpact:
    """Per-state/UT GPS + GIC risk for all 34 regions with ISRO stations."""
    return IndiaImpact(
        flare_class=flare_class,
        regions=[IndiaRiskRow.model_validate(r) for r in india_risks(flare_class)],
    )


def _risk_rank(risk: str) -> int:
    return ["green", "yellow", "orange", "red"].index(risk)
