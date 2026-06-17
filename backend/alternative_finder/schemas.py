from typing import Optional
from pydantic import BaseModel


class Candidate(BaseModel):
    supplier_id: str
    supplier_name: str
    region: str
    commodity_type: str
    lead_time_days: int
    capacity_units_per_month: int
    certifications: list[str]
    rerank_score: Optional[float] = None


class AlternativeFinderState(BaseModel):
    session_id: str
    disrupted_supplier_id: str
    condition_id: str
    candidates: list[Candidate] = []
    reranked: list[Candidate] = []
    validated: list[Candidate] = []
    result_summary: Optional[str] = None


class AlternativeFinderResult(BaseModel):
    session_id: str
    disrupted_supplier_id: str
    alternatives: list[Candidate]
    summary: str
