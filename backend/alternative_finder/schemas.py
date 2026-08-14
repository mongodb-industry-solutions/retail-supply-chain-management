"""
State contract for the alternative_finder agent (Stage 4.0 — plumbing only).

Like ``risk_evaluator``, LangGraph carries state as a plain ``TypedDict``: the type
hints exist for developer safety and IDE autocompletion, never enforced at runtime.
This state has one explicit slot per layer of the new four-layer design
(Plan → Deterministic Funnel → Reflect & Critique → Close), so the *shape* flows
end-to-end through the graph before any real business logic exists.

In this stage every slot is populated with clearly-fake placeholder values by the
nodes (see ``nodes.py``). Nothing here reads Mongo, calls an LLM, or runs a
vector/geo/rank aggregation — that is Stage 4.1 onward. The old ``Candidate`` /
``AlternativeFinderState`` / ``AlternativeFinderResult`` models (hybrid_search →
voyage_rerank → validate_*) encoded the replaced pipeline and have been removed
entirely.
"""

from typing import TypedDict


class AlternativeFinderState(TypedDict):
    """Mutable state dict carried through every node of the LangGraph pipeline.

    Fields are grouped by the layer that produces them. Slots owned by a later
    layer start empty and are filled as the pipeline advances; each node returns
    only the keys it modifies and LangGraph merges partial updates automatically.
    """

    # --- Request / entry context -------------------------------------------
    session_id: str
    evaluation_id_ref: str
    supplier_id: str              # read server-side from supplier_risk_evaluations (placeholder)
    risk_types: list[str]         # read server-side from the referenced evaluation (placeholder)

    # --- Layer 0 (Plan) outputs --------------------------------------------
    region_exclude: list[str]     # regions to exclude, derived from the risk profile
    doc_type_hint: list[str]      # which evidence doc types to prioritise
    profile_text: str             # natural-language search profile for the funnel

    # --- Layer 1 (Deterministic Funnel) outputs ----------------------------
    # Each candidate: {supplier_id, supplier_name, location, category} — no scores yet.
    candidates: list[dict]

    # --- Layer 2 (Reflect & Critique) outputs ------------------------------
    # Keyed by supplier_id. Each audit:
    #   {criteria: [{criterion, status, citation|null, note?}],
    #    # citation: {chunk_id, doc_type, source_file, page, excerpt, valid_until,
    #    #            language, excerpt_language}  — the last two are BCP-47 tags and may be
    #    #            absent/None on documents persisted before they were added.
    #    precedent: {exact_track_record, semantic_precedent},   # two separate fields, never merged
    #    evidence_coverage: {criteria_total, criteria_verified}}
    audits: dict

    # --- Layer 3 (Close) outputs -------------------------------------------
    proximity_km: dict            # {supplier_id: float} — real $geoNear later
    # Final shortlist entries (shortlist_ready.candidates shape). Each entry additionally
    # carries an integer `rank` (1-indexed, set by rank_assembly_node), a plain-text
    # `rationale` (narrative only, set by summarize_node) explaining why the candidate holds
    # that position, and a `glossary` list of {term, definition} dicts (also set by
    # summarize_node) defining the internal terms the rationale used — structured data, not
    # flattened into the rationale string. Purely additive: same candidates[] array, same
    # shortlist_ready event, no new SSE event type.
    shortlist: list[dict]
    approved_supplier_id: str | None   # always null until a human approves

    # --- Cross-cutting accumulators (mirrors risk_evaluator) ----------------
    agent_thoughts: list[dict]
    atlas_operations: list[dict]
