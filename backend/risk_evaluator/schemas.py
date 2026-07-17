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

from typing import Literal, TypedDict

from pydantic import BaseModel, ConfigDict


class RiskEvaluatorState(TypedDict):
    """Mutable state dict carried through every node of the LangGraph pipeline.

    Uses TypedDict (not Pydantic) because LangGraph treats state as a plain dict
    internally — type hints are for IDE safety only and are never enforced at runtime.
    """

    session_id: str
    conditions: list[dict]        # active signals from external_conditions
    exposed_suppliers: dict       # {supplier_id: supplier_doc + operational_context}
    risk_scores: dict             # {supplier_id: list[RiskScore]}
    memory_episodes: dict         # {supplier_id: list[episode_doc]}
    historical_weight: dict       # {supplier_id: float} — derived by reason_and_retrieve
    evaluations: list[dict]       # documents written to supplier_risk_evaluations
    agent_thoughts: list[str]
    atlas_operations: list[dict]


class TriggeredBy(BaseModel):
    """Records the multipliers that produced a supplier's rpn_dynamic.

    ``source`` is the data provider (e.g. USGS, news feed).  ``condition_score`` is the
    signal magnitude set by the ingestion step.  ``historical_weight`` is set by
    ``reason_and_retrieve`` (>1.0 amplifies risk, <1.0 attenuates, 1.0 is neutral).
    ``distance_decay`` is only present for physical conditions that carry an epicentre
    coordinate; it is ``None`` for region-based conditions.  ``risk_type_triggered`` is
    the ``risk_type`` of the ``risk_catalog`` document identified by the parent
    ``RiskScore``'s ``risk_id`` (e.g. ``"geopolitical_tariff"``) — not to be confused
    with the ``risk_type_triggered`` field on the originating ``external_conditions``
    document, which is a separate value.
    """

    source: str
    condition_score: float
    historical_weight: float
    distance_decay: float | None = None
    risk_type_triggered: str


class RiskScore(BaseModel):
    """One risk assessment for a single (supplier, condition) pair.

    ``rpn_base`` is the static catalog baseline calculated from catalog fields alone.
    ``rpn_dynamic`` is the live score after ``condition_score``, ``distance_decay``,
    and ``historical_weight`` are applied.  ``rpn_status`` is one of CRITICAL / ALERT /
    WATCH / OK, derived by comparing ``rpn_dynamic`` against the catalog's
    ``alert_threshold_rpn``.
    """

    risk_id: str
    condition_id: str
    rpn_base: float
    rpn_dynamic: float
    rpn_status: str               # "CRITICAL" | "ALERT" | "WATCH" | "OK"
    triggered_by: TriggeredBy


class GeoPoint(BaseModel):
    """GeoJSON Point, reusing the exact shape stored on ``suppliers.location``."""

    type: Literal["Point"] = "Point"
    coordinates: list[float]       # [lng, lat]


class OperationalContext(BaseModel):
    """Active order exposure for a supplier at evaluation time.

    Sourced from ``purchase_orders`` in ``match_suppliers``.  ``criticality`` is the
    highest order criticality across all active orders (high > medium > low), determined
    by mapping string labels to numeric ranks via ``_CRITICALITY_RANK``.  Constrained to
    exactly the three levels ``_CRITICALITY_RANK`` and ``_RANK_TO_CRITICALITY`` support.
    """

    active_orders: int
    total_value_usd: float
    earliest_delivery_due: str
    days_until_due: int
    criticality: Literal["high", "medium", "low"]


class SupplierEvaluation(BaseModel):
    """Full risk profile for one supplier, as sent in the ``agent_response`` SSE event
    and persisted in ``supplier_risk_evaluations``.

    ``supplier_risk_level`` is the highest ``rpn_status`` across all ``risk_scores``,
    selected using ``_STATUS_RANK`` in ``generate_summary``.  ``requires_action`` is
    ``True`` when at least one score is CRITICAL or ALERT.  ``location`` is copied as-is
    from the supplier's ``location`` field in the ``suppliers`` collection (already a
    GeoJSON Point there).
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    evaluation_id: str
    supplier_id: str
    supplier_name: str
    region: str
    country: str
    product_categories: list[str]
    location: GeoPoint
    supplier_risk_level: str
    requires_action: bool
    operational_context: OperationalContext
    risk_scores: list[RiskScore]
    natural_language_summary: str
    session_id: str


class EvaluationResult(BaseModel):
    """Top-level payload of the ``agent_response`` SSE event.

    ``conditions`` are the raw ``external_conditions`` documents that triggered this
    evaluation run.  ``suppliers`` contains only suppliers with at least one non-OK
    score; OK-only suppliers are filtered out in ``generate_summary``.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    session_id: str
    conditions: list[dict]
    suppliers: list[SupplierEvaluation]


class AtlasOperation(BaseModel):
    """Schema for an ``atlas_operation`` SSE event.

    Emitted by each node when it issues a MongoDB query so the frontend can render a
    live "Atlas features in use" panel.  ``feature`` is one of: Query, Geospatial,
    Vector Search, Aggregation — each mapping to a distinct MongoDB capability.
    """

    feature: str
    collection: str
    detail: str
    supplier_id: str | None = None
    result_count: int | None = None
