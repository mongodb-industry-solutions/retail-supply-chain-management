from typing import Optional
from pydantic import BaseModel


class RiskScore(BaseModel):
    supplier_id: str
    condition_id: str
    severity: float
    occurrence: float
    detectability: float
    rpn: float
    breaches_threshold: bool


class RiskEvaluatorState(BaseModel):
    session_id: str
    triggered_conditions: list[dict] = []
    matched_suppliers: list[dict] = []
    rpn_scores: list[RiskScore] = []
    memory_context: Optional[str] = None
    summary: Optional[str] = None


class EvaluationResult(BaseModel):
    session_id: str
    rpn_scores: list[RiskScore]
    summary: str
