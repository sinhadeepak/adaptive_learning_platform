"""Adaptive Engine HTTP surface.

Two endpoints today:
  POST /irt/ability      — re-estimate θ given the response history
  POST /irt/select-next  — pick the next item via MFI

Both return a `theta_used` so callers (Quiz) can persist the value the engine
actually consumed for selection — useful for audit + reproducibility.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from adaptive_engine.irt import (
    CandidateItem,
    Item,
    Response,
    eap_estimate,
    fisher_information,
    select_mfi,
)

router = APIRouter()


class IRTItemDTO(BaseModel):
    a: float = Field(gt=0, description="Discrimination")
    b: float = Field(description="Difficulty")
    c: float = Field(ge=0, lt=1, description="Guessing parameter")


class ResponseDTO(IRTItemDTO):
    is_correct: bool


class CandidateDTO(IRTItemDTO):
    id: str


class AbilityRequest(BaseModel):
    responses: list[ResponseDTO] = Field(default_factory=list)
    prior_mean: float = 0.0
    prior_sd: float = 1.0


class AbilityResponse(BaseModel):
    theta: float
    se: float
    n: int


class SelectNextRequest(BaseModel):
    theta: float
    candidates: list[CandidateDTO]
    exclude: list[str] = Field(default_factory=list)
    exposure_count: dict[str, int] = Field(default_factory=dict)
    exposure_cap: int = 5


class SelectNextResponse(BaseModel):
    item_id: str | None
    fisher_info: float
    theta_used: float


@router.post("/irt/ability", response_model=AbilityResponse)
async def post_ability(req: AbilityRequest) -> AbilityResponse:
    responses = [
        Response(item=Item(a=r.a, b=r.b, c=r.c), is_correct=r.is_correct) for r in req.responses
    ]
    theta, se = eap_estimate(responses, prior_mean=req.prior_mean, prior_sd=req.prior_sd)
    return AbilityResponse(theta=theta, se=se, n=len(responses))


@router.post("/irt/select-next", response_model=SelectNextResponse)
async def post_select_next(req: SelectNextRequest) -> SelectNextResponse:
    candidates = [CandidateItem(id=c.id, item=Item(a=c.a, b=c.b, c=c.c)) for c in req.candidates]
    chosen = select_mfi(
        theta=req.theta,
        candidates=candidates,
        exclude=set(req.exclude),
        exposure_count=req.exposure_count,
        exposure_cap=req.exposure_cap,
    )
    if chosen is None:
        return SelectNextResponse(item_id=None, fisher_info=0.0, theta_used=req.theta)
    info = fisher_information(req.theta, chosen.item)
    return SelectNextResponse(item_id=chosen.id, fisher_info=info, theta_used=req.theta)
