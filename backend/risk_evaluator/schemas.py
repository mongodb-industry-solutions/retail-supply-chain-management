"""
State contracts and output models for the risk evaluator agent.

In a LangGraph graph, state is the single shared object that every node reads from and
writes to. ``RiskEvaluatorState`` is a ``TypedDict`` rather than a Pydantic model because
LangGraph treats state as a plain Python dict internally — type hints are purely for
developer safety and IDE autocompletion, never enforced at runtime by the framework.
Using a ``TypedDict`` keeps state manipulation fast and avoids the overhead of
validation on every node transition.

The Pydantic models (``RiskScore``, ``SupplierEvaluation``, ``EvaluationResult``, etc.)
serve a different purpose: they validate and serialize data *leaving* the graph — either
as the SSE payload streamed to the frontend or as documents inserted into MongoDB.  They
are constructed inside nodes from raw dict data and never placed into the graph state
directly, which is why they do not appear as field types in ``RiskEvaluatorState``.

This separation maps directly to the Context Engineering concept: the ``TypedDict`` is
the assembled context the agent carries through every node — raw, mutable, and
structurally open — while the Pydantic models are the hardened, validated outputs that
cross system boundaries.  Keeping these concerns separate makes it easy to evolve the
internal state shape without breaking the external contract.
"""

from typing import TypedDict

from pydantic import BaseModel, ConfigDict


class RiskEvaluatorState(TypedDict):
    session_id: str
    conditions: list[dict]        # active signals from external_conditions
    exposed_suppliers: dict       # {supplier_id: supplier_doc + operational_context}
    risk_scores: dict             # {supplier_id: list[RiskScore]}
    memory_episodes: dict         # {supplier_id: list[episode_doc]}
    evaluations: list[dict]       # documents written to supplier_risk_evaluations


class TriggeredBy(BaseModel):
    source: str
    condition_score: float
    historical_weight: float
    distance_decay: float | None = None


class RiskScore(BaseModel):
    risk_id: str
    condition_id: str
    rpn_base: float
    rpn_dynamic: float
    rpn_status: str               # "CRITICAL" | "ALERT" | "WATCH" | "OK"
    triggered_by: TriggeredBy


class OperationalContext(BaseModel):
    active_orders: int
    total_value_usd: float
    earliest_delivery_due: str
    days_until_due: int
    criticality: str


class SupplierEvaluation(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    supplier_id: str
    supplier_name: str
    region: str
    country: str
    product_categories: list[str]
    supplier_risk_level: str
    requires_action: bool
    operational_context: OperationalContext
    risk_scores: list[RiskScore]
    natural_language_summary: str
    session_id: str


class EvaluationResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    session_id: str
    conditions: list[dict]
    suppliers: list[SupplierEvaluation]
