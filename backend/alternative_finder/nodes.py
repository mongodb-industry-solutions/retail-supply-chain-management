"""
LangGraph nodes for the alternative_finder agent — Stage 4.0 (plumbing only).

Each node corresponds to one layer of the new four-layer design:

    plan_node            (layer 0) — Plan
    funnel_node          (layer 1) — Deterministic Funnel
    reflect_critique_node(layer 2) — Reflect & Critique
    close_node           (layer 3) — Close

In THIS stage every node:
  * accepts and returns the real ``AlternativeFinderState`` (not a no-op passthrough),
  * fills its own slice of the state with clearly-fake PLACEHOLDER values, and
  * emits the SSE events defined in ``README.md`` for its layer.

No node reads or writes Mongo, calls an LLM, or runs $rankFusion / $rerank /
$vectorSearch / $geoNear — that is Stage 4.1 onward. The ``atlas_operation`` events
carry the *real* operation_type / collection / description strings from the contract's
mapping table but PLACEHOLDER ``metrics``; Stage 4.1 will swap the metrics for live
counts without changing the event shape.

Events are written onto the ``asyncio.Queue`` found at
``config["configurable"]["queue"]`` — the same conveyor-belt pattern as
``risk_evaluator``. Unlike risk_evaluator, every event uses the ``"event"`` key and the
common envelope (event / layer / timestamp / session_id) from the README contract.
"""

import json
import logging
import re
from datetime import datetime, timezone

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from core.config import get_settings
from core.db import get_database
from alternative_finder.schemas import AlternativeFinderState

logger = logging.getLogger(__name__)

# Real ``doc_type`` vocabulary in the ``supplier_documents`` collection (confirmed by
# distinct() against live data, 2026-07-07). Passed to the LLM so ``doc_type_hint``
# grounds to values Layer 1 can actually filter on rather than free-text guesses.
_DOC_TYPES = ["audit_report", "certificate", "contract", "email", "sustainability_report"]

# --- Layer 1 (funnel) real-infra constants, all confirmed live 2026-07-07 ----------
# Vector + full-text search indexes over supplier_documents (both READY on the cluster).
_DOCS_VECTOR_INDEX = "supplier_documents_vector_index"      # autoEmbed voyage-4 on auto_embed_text; filters supplier_id, doc_type
_DOCS_FULLTEXT_INDEX = "supplier_documents_fulltext_index"  # $search on chunk_text (lucene.standard)
# Native Voyage reranker — requires the "Native Reranking" Atlas project setting ON and a
# project-level Voyage Model API key (both enabled 2026-07-07). Model confirmed available.
_RERANK_MODEL = "rerank-2.5"
# rankFusion weights: semantic profile match matters more than lexical overlap for sourcing.
_FUSION_WEIGHTS = {"vector": 0.7, "text": 0.3}
_FUSION_LIMIT = 50          # chunks kept from each search arm / fused output (README's "top 50")
_TARGET_CANDIDATES = 5      # distinct suppliers to hand to Layer 2 (README's "top 5")
# Capacity-margin gate: committed_capacity_pct is fraction of capacity already committed, so a
# lower value means more spare capacity to absorb reallocated volume. 0.90 keeps only suppliers
# with >=10% headroom. JUDGMENT CALL (no design doc specifies a threshold) — flagged in the
# stage report; real data ranges ~0.30-0.70 so this is permissive, not pool-emptying.
_CAPACITY_MAX = 0.90


class PlanResolutionError(Exception):
    """Raised by plan_node when ``evaluation_id_ref`` does not resolve to a real
    ``supplier_risk_evaluations`` document. plan_node emits the contract ``error`` event
    itself before raising; ``run_graph_task`` catches this and emits only ``stream_end``
    (status ``failed``) so the error is not duplicated — never falling through to
    placeholder data.
    """


# --- Layer labels, used in layer_started events -----------------------------
_LAYER_LABELS = {
    0: "Planning: synthesising a search profile from the risk evaluation",
    1: "Deterministic funnel: narrowing candidates",
    2: "Reflect & critique: generating and auditing cited claims",
    3: "Close: proximity ranking and shortlist assembly",
}


def _now() -> str:
    """UTC timestamp in the ISO-8601 / Zulu shape the contract's examples use."""
    return datetime.now(timezone.utc).isoformat()


def _get_queue(config: dict):
    """Pull the SSE queue out of the LangGraph config (see risk_evaluator/router.py)."""
    return config.get("configurable", {}).get("queue")


async def _emit(config: dict, session_id: str, event: str, *, layer=None, **fields):
    """Build a contract envelope and push it onto the SSE queue.

    ``layer`` is included as-is (``None`` for non-layer-specific events like
    ``alternative_finder_started`` / ``stream_end``). Event-specific fields are
    merged on top of the common envelope.
    """
    queue = _get_queue(config)
    if queue is None:
        return
    payload = {
        "event": event,
        "layer": layer,
        "timestamp": _now(),
        "session_id": session_id,
        **fields,
    }
    await queue.put(payload)


_PLAN_SYSTEM_PROMPT = (
    "You are a supply chain sourcing strategist. A supplier is disrupted by a specific "
    "risk, and a search must be planned to find alternative suppliers. Given the risk "
    "evaluation, the disrupted supplier's region, and any time pressure from active "
    "orders, produce a search plan.\n\n"
    "Respond with ONLY a single JSON object, no prose, matching exactly:\n"
    "{\n"
    '  "region_exclude": ["<ISO region codes to EXCLUDE from candidates>"],\n'
    '  "doc_type_hint": ["<evidence document types to prioritise in Layer 1 search>"],\n'
    '  "profile_text": "<one natural-language paragraph describing the ideal alternative '
    'supplier, used verbatim as the semantic search query>",\n'
    '  "reasoning": "<2-4 sentences explaining the exclusions, doc-type priorities, and '
    'any time pressure that shaped the profile>"\n'
    "}\n\n"
    f"doc_type_hint values MUST be chosen from this exact set: {_DOC_TYPES}.\n"
    "region_exclude values MUST be ISO region/country codes (e.g. CN, TW, MX). Exclude "
    "the regions the risk applies to and the disrupted supplier's own region when the "
    "risk is regional. profile_text must NOT name the disrupted supplier; it describes "
    "the replacement being sought."
)


def _extract_json(text: str) -> dict:
    """Parse the first JSON object out of an LLM response, tolerating ```json fences.

    Mirrors risk_evaluator's Final-Answer parsing approach (regex + json.loads) since no
    ``with_structured_output`` pattern exists anywhere in this codebase to match.
    """
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = brace.group(0) if brace else text
    return json.loads(candidate)


def _make_llm() -> ChatAnthropic:
    """Build the ChatAnthropic client exactly as risk_evaluator does (proxy base_url +
    api-key header), for a single, non-tool synthesis call."""
    settings = get_settings()
    return ChatAnthropic(
        model=settings.anthropic_model,
        api_key="placeholder",
        base_url=settings.llm_base_url,
        default_headers={"api-key": settings.llm_api_key},
    )


# ---------------------------------------------------------------------------
# Layer 0 — Plan
# ---------------------------------------------------------------------------
async def plan_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Synthesise a search plan from the referenced risk evaluation — Stage 4.1 (real).

    Reads the real ``supplier_risk_evaluations`` document by ``evaluation_id``, resolves
    each ``risk_scores[].risk_id`` to its human ``risk_type`` via ``risk_catalog``
    (and its ``applies_to_regions``), reads the disrupted supplier's active
    ``purchase_orders`` for time-pressure signals, then makes a single structured LLM
    call to produce ``region_exclude`` / ``doc_type_hint`` / ``profile_text``. If the
    evaluation cannot be resolved it emits an ``error`` (recoverable: false) and raises
    ``PlanResolutionError`` rather than falling through to placeholder data.

    Layers 1-3 stay placeholder (Stage 4.0) but now consume this node's real output.
    """
    session_id = state["session_id"]
    evaluation_id_ref = state["evaluation_id_ref"]

    await _emit(config, session_id, "layer_started", layer=0, label=_LAYER_LABELS[0])

    db = await get_database()

    # --- Read the referenced risk evaluation (field confirmed: `evaluation_id`) ------
    eval_doc = await db["supplier_risk_evaluations"].find_one(
        {"evaluation_id": evaluation_id_ref}
    )
    await _emit(
        config, session_id, "atlas_operation", layer=0,
        operation_type="find", collection="supplier_risk_evaluations",
        description="Reading the real risk evaluation",
        metrics={"documents_read": 1 if eval_doc else 0},
    )
    if eval_doc is None:
        await _emit(
            config, session_id, "error", layer=0,
            message=(
                f"evaluation_id_ref '{evaluation_id_ref}' did not resolve to a "
                "supplier_risk_evaluations document"
            ),
            recoverable=False,
        )
        raise PlanResolutionError(evaluation_id_ref)

    supplier_id = eval_doc["supplier_id"]
    supplier_region = eval_doc.get("region", "")
    supplier_country = eval_doc.get("country", "")
    product_categories = eval_doc.get("product_categories", [])
    risk_scores = eval_doc.get("risk_scores", [])
    risk_ids = [s["risk_id"] for s in risk_scores if s.get("risk_id")]

    # --- Resolve risk_id -> risk_type via risk_catalog (see ambiguity note) ----------
    # `risk_scores[].risk_id` are catalog codes (e.g. RISK-LOG-001), NOT the human
    # risk_type strings the README example assumed. The authoritative mapping lives in
    # risk_catalog, which also carries `applies_to_regions` — real data for exclusions.
    catalog_docs = await db["risk_catalog"].find(
        {"risk_id": {"$in": risk_ids}}
    ).to_list(length=None)
    await _emit(
        config, session_id, "atlas_operation", layer=0,
        operation_type="find", collection="risk_catalog",
        description="Resolving risk types and affected regions for the evaluated risks",
        metrics={"documents_read": len(catalog_docs)},
    )
    catalog_by_id = {c["risk_id"]: c for c in catalog_docs}
    risk_types = sorted({
        c["risk_type"] for c in catalog_docs if c.get("risk_type")
    })
    applies_to_regions = sorted({
        r for c in catalog_docs for r in c.get("applies_to_regions", [])
    })

    # --- Read the disrupted supplier's active purchase orders (status == "active") ----
    # Confirmed active is a literal `status` value (statuses: active/in_transit/pending).
    active_orders = await db["purchase_orders"].find(
        {"supplier_id": supplier_id, "status": "active"}
    ).to_list(length=None)
    await _emit(
        config, session_id, "atlas_operation", layer=0,
        operation_type="find", collection="purchase_orders",
        description="Checking active orders for time pressure",
        metrics={"documents_read": len(active_orders)},
    )

    # Distil time-pressure signals from the real orders.
    due_values = [o["days_until_due"] for o in active_orders if o.get("days_until_due") is not None]
    soonest_due = min(due_values) if due_values else None
    total_value = sum(o.get("value_usd", 0) for o in active_orders)
    has_promo = any(o.get("promotional_window") for o in active_orders)

    if active_orders:
        pressure_line = (
            f"{len(active_orders)} active orders, ${total_value:,.0f} total, "
            f"soonest due in {soonest_due} days"
            + (", inside a fixed promotional launch window" if has_promo else "")
        )
    else:
        pressure_line = "No active orders on record — no acute delivery deadline pressure."

    # --- Single structured LLM call (no tools, no ReAct loop) -------------------------
    risk_summary = ", ".join(
        f"{catalog_by_id.get(s['risk_id'], {}).get('risk_type', s['risk_id'])} "
        f"[{s['risk_id']} {s.get('rpn_status', '')}]"
        for s in risk_scores
    )
    human = (
        f"Disrupted supplier: {supplier_id} in region {supplier_region} "
        f"({supplier_country}).\n"
        f"Affected product categories: {product_categories}.\n"
        f"Overall risk level: {eval_doc.get('supplier_risk_level', '')}.\n"
        f"Evaluated risks: {risk_summary}.\n"
        f"Regions these risks apply to (from risk_catalog): {applies_to_regions}.\n"
        f"Time pressure: {pressure_line}\n\n"
        f"Risk narrative: {eval_doc.get('natural_language_summary', '')}\n\n"
        "Produce the search plan JSON now."
    )

    llm = _make_llm()
    response = await llm.ainvoke(
        [SystemMessage(content=_PLAN_SYSTEM_PROMPT), HumanMessage(content=human)]
    )
    try:
        plan = _extract_json(response.content)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("plan_node: could not parse LLM plan JSON — %s", exc)
        raise

    region_exclude = [str(r) for r in plan.get("region_exclude", [])]
    # Keep only doc types that actually exist in supplier_documents.
    doc_type_hint = [d for d in plan.get("doc_type_hint", []) if d in _DOC_TYPES]
    profile_text = str(plan.get("profile_text", "")).strip()
    thought = str(plan.get("reasoning", "")).strip() or (
        f"Planned an alternative-supplier search for {supplier_id}, "
        f"excluding {region_exclude}."
    )

    await _emit(
        config, session_id, "agent_thought", layer=0,
        step="plan_synthesis", text=thought,
    )

    await _emit(
        config, session_id, "layer_completed", layer=0,
        supplier_id=supplier_id,
        risk_types=risk_types,
        summary=(
            f"Plan synthesised: {len(region_exclude)} region(s) excluded, "
            f"{len(doc_type_hint)} doc type(s) prioritised, profile ready"
        ),
    )

    return {
        "supplier_id": supplier_id,
        "risk_types": risk_types,
        "region_exclude": region_exclude,
        "doc_type_hint": doc_type_hint,
        "profile_text": profile_text,
        "agent_thoughts": state["agent_thoughts"] + [{"step": "plan_synthesis", "text": thought}],
    }


# ---------------------------------------------------------------------------
# Layer 1 — Deterministic Funnel
# ---------------------------------------------------------------------------
async def funnel_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Narrow the supplier universe to a small candidate set — Stage 4.2 (real).

    Deterministic by design: NO LLM call, so this layer emits no ``agent_thought``
    events. Three real MongoDB operations against the live cluster, each surfaced as an
    ``atlas_operation`` with real before/after counts:

      1. ``$match`` on ``suppliers`` — active suppliers sharing the disrupted supplier's
         product category, outside ``region_exclude``, with capacity headroom, minus the
         disrupted supplier itself. Produces the candidate pool.
      2. ``$rankFusion`` (``$vectorSearch`` + ``$search``) over ``supplier_documents`` —
         fuses semantic match on ``profile_text`` (autoEmbed voyage-4) with lexical match
         on ``chunk_text``, restricted to the pool via the vectorSearch ``$in`` filter
         (confirmed supported) and biased to ``doc_type_hint`` on the vector arm.
      3. native Voyage ``$rerank`` — reranks the fused chunks against ``profile_text``,
         then we dedupe to the top ``_TARGET_CANDIDATES`` distinct suppliers.

    Candidate order follows the reranker. Each candidate carries the four fields Layers
    2-3 consume (supplier_id, supplier_name, location, category), read from the real
    ``suppliers`` documents already fetched in step 1.
    """
    session_id = state["session_id"]
    region_exclude = state.get("region_exclude", [])
    doc_type_hint = state.get("doc_type_hint", [])
    profile_text = state.get("profile_text", "").strip()
    disrupted_supplier_id = state.get("supplier_id", "")

    await _emit(config, session_id, "layer_started", layer=1, label=_LAYER_LABELS[1])

    db = await get_database()

    # --- Resolve the disrupted supplier's product categories to build the $match ------
    # Deterministic lookup used only to construct the filter below (not a search op, so
    # not surfaced as its own atlas_operation — the $match is the headline operation).
    disrupted = await db["suppliers"].find_one(
        {"supplier_id": disrupted_supplier_id}, {"_id": 0, "product_categories": 1}
    )
    categories = (disrupted or {}).get("product_categories", [])

    # --- 1. $match on suppliers -------------------------------------------------------
    match_filter: dict = {
        "status": "active",
        "committed_capacity_pct": {"$lte": _CAPACITY_MAX},
    }
    if disrupted_supplier_id:
        match_filter["supplier_id"] = {"$ne": disrupted_supplier_id}
    if categories:
        match_filter["product_categories"] = {"$in": categories}
    if region_exclude:
        match_filter["region"] = {"$nin": region_exclude}

    total_active = await db["suppliers"].count_documents({"status": "active"})
    pool = await db["suppliers"].find(
        match_filter,
        {"_id": 0, "supplier_id": 1, "supplier_name": 1, "region": 1,
         "country": 1, "product_categories": 1},
    ).to_list(length=None)
    pool_ids = [p["supplier_id"] for p in pool]
    pool_by_id = {p["supplier_id"]: p for p in pool}

    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$match", collection="suppliers",
        description=(
            "Filtering active suppliers by category "
            f"{categories}, excluding regions {region_exclude or '[]'}, "
            f"requiring >={int((1 - _CAPACITY_MAX) * 100)}% capacity headroom"
        ),
        metrics={"candidates_in": total_active, "candidates_out": len(pool)},
    )

    # No eligible suppliers — nothing to search. Emit the remaining ops as zero-count so
    # the event sequence stays consistent, then hand an empty candidate set downstream.
    if not pool_ids:
        for op, desc in (
            ("$rankFusion", "No candidate pool — semantic/full-text search skipped"),
            ("$rerank", "No candidate pool — reranking skipped"),
        ):
            await _emit(
                config, session_id, "atlas_operation", layer=1,
                operation_type=op, collection="supplier_documents",
                description=desc, metrics={"candidates_in": 0, "candidates_out": 0},
            )
        await _emit(
            config, session_id, "layer_completed", layer=1,
            summary="0 candidates — no suppliers matched the pre-filter",
        )
        return {"candidates": []}

    # --- 2. $rankFusion ($vectorSearch + $search) over supplier_documents -------------
    query_text = profile_text or f"alternative supplier for {', '.join(categories) or 'the disrupted category'}"

    # Vector-arm filter: restrict to the pool (confirmed $in works) and bias to the
    # planned doc types on the arm whose index actually supports a doc_type filter (the
    # full-text index maps only chunk_text, so doc_type can't be filtered there).
    vector_filter: dict = {"supplier_id": {"$in": pool_ids}}
    if doc_type_hint:
        vector_filter["doc_type"] = {"$in": doc_type_hint}

    # Real "in" count for the fusion: how many chunks are actually eligible.
    corpus_filter: dict = {"supplier_id": {"$in": pool_ids}}
    if doc_type_hint:
        corpus_filter["doc_type"] = {"$in": doc_type_hint}
    corpus_size = await db["supplier_documents"].count_documents(corpus_filter)

    def _rank_fusion_stage() -> dict:
        return {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vector": [
                            {
                                "$vectorSearch": {
                                    "index": _DOCS_VECTOR_INDEX,
                                    "query": {"text": query_text},
                                    "path": "auto_embed_text",
                                    "filter": vector_filter,
                                    "numCandidates": max(len(pool_ids) * 20, 150),
                                    "limit": _FUSION_LIMIT,
                                }
                            }
                        ],
                        "text": [
                            {
                                "$search": {
                                    "index": _DOCS_FULLTEXT_INDEX,
                                    "text": {"query": query_text, "path": "chunk_text"},
                                }
                            },
                            {"$match": {"supplier_id": {"$in": pool_ids}}},
                            {"$limit": _FUSION_LIMIT},
                        ],
                    }
                },
                "combination": {"weights": _FUSION_WEIGHTS},
            }
        }

    fused = await db["supplier_documents"].aggregate([
        _rank_fusion_stage(),
        {"$limit": _FUSION_LIMIT},
        {"$project": {"_id": 0, "chunk_id": 1, "supplier_id": 1, "doc_type": 1}},
    ]).to_list(length=None)

    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$rankFusion", collection="supplier_documents",
        description=(
            f"Combining semantic and full-text search across {corpus_size} document "
            f"chunks from {len(pool_ids)} pre-filtered suppliers"
        ),
        metrics={"candidates_in": corpus_size, "candidates_out": len(fused)},
    )

    # --- 3. native Voyage $rerank -----------------------------------------------------
    reranked: list[dict] = []
    if fused:
        reranked = await db["supplier_documents"].aggregate([
            _rank_fusion_stage(),
            {"$limit": _FUSION_LIMIT},
            {
                "$rerank": {
                    "query": {"text": query_text},
                    "path": "chunk_text",
                    "model": _RERANK_MODEL,
                    "numDocsToRerank": len(fused),
                }
            },
            {"$project": {"_id": 0, "chunk_id": 1, "supplier_id": 1, "doc_type": 1}},
        ]).to_list(length=None)

    # Dedupe reranked chunks to the top distinct suppliers, preserving rerank order.
    ordered_supplier_ids: list[str] = []
    seen: set[str] = set()
    for chunk in reranked:
        sid = chunk["supplier_id"]
        if sid not in seen:
            seen.add(sid)
            ordered_supplier_ids.append(sid)
        if len(ordered_supplier_ids) >= _TARGET_CANDIDATES:
            break

    candidates: list[dict] = []
    for sid in ordered_supplier_ids:
        sup = pool_by_id.get(sid, {})
        cats = sup.get("product_categories", [])
        # Prefer a category shared with the disrupted supplier; else the supplier's own.
        shared = [c for c in cats if c in categories]
        category = (shared or cats or [""])[0]
        candidates.append({
            "supplier_id": sid,
            "supplier_name": sup.get("supplier_name", sid),
            # No city field exists in suppliers; country is the finest real location text.
            "location": sup.get("country", sup.get("region", "")),
            "category": category,
        })

    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$rerank", collection="supplier_documents",
        description=(
            "Native Voyage reranking (in-cluster, no external call), narrowing to top "
            f"{_TARGET_CANDIDATES} suppliers"
        ),
        metrics={"candidates_in": len(fused), "candidates_out": len(candidates)},
    )

    await _emit(
        config, session_id, "layer_completed", layer=1,
        summary=f"{len(candidates)} candidates selected from {corpus_size} document chunks",
    )

    return {"candidates": candidates}


# ---------------------------------------------------------------------------
# Layer 2 — Reflect & Critique
# ---------------------------------------------------------------------------
async def reflect_critique_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Generate cited claims per candidate, then audit them.

    Real behaviour (later): two distinct LLM passes (generate, then audit) plus a
    bounded gap-resolution loop; exact + semantic precedent lookups against
    agent_memory. Here: placeholder criteria/precedent, real event shapes. The two
    memory mechanisms are kept as separate objects, never merged into one score.
    """
    session_id = state["session_id"]
    candidates = state["candidates"]

    await _emit(config, session_id, "layer_started", layer=2, label=_LAYER_LABELS[2])

    # --- Generate pass: one thought + one candidate_generated per candidate ---
    for cand in candidates:
        await _emit(
            config, session_id, "agent_thought", layer=2,
            step="generate",
            text=f"[PLACEHOLDER] Drafting cited claims for {cand['supplier_id']}.",
        )
        await _emit(
            config, session_id, "candidate_generated", layer=2,
            supplier_id=cand["supplier_id"],
            supplier_name=cand["supplier_name"],
            location=cand["location"],
            category=cand["category"],
        )

    # --- Precedent / evidence-gap Atlas operations (once for the layer) -------
    await _emit(
        config, session_id, "atlas_operation", layer=2,
        operation_type="find", collection="agent_memory",
        description="Checking if this candidate was proposed before (episode.resolution.alt_supplier_id)",
        metrics={"documents_read": 0},
    )
    await _emit(
        config, session_id, "atlas_operation", layer=2,
        operation_type="$vectorSearch", collection="agent_memory",
        description="Cross-supplier semantic precedent search by risk_type",
        metrics={"candidates_in": 0, "candidates_out": 0},
    )
    await _emit(
        config, session_id, "atlas_operation", layer=2,
        operation_type="find", collection="supplier_documents",
        description="Resolving a specific evidence gap",
        metrics={"documents_read": 0},
    )

    # --- Audit pass: one thought + one candidate_audited per candidate --------
    audits: dict = {}
    for cand in candidates:
        await _emit(
            config, session_id, "agent_thought", layer=2,
            step="audit",
            text=f"[PLACEHOLDER] Verifying claims for {cand['supplier_id']}.",
        )

        criteria = [
            {
                "criterion": "compliance_certification",
                "status": "compliant",
                "citation": {
                    "chunk_id": "PLACEHOLDER_chunk",
                    "doc_type": "pdf",
                    "source_file": "PLACEHOLDER_certificate.pdf",
                    "page": 1,
                    "excerpt": "[PLACEHOLDER excerpt]",
                    "valid_until": "2027-01-01",
                },
            },
            {
                "criterion": "operational_status",
                "status": "unknown",
                "citation": None,
                "note": "PLACEHOLDER — no recent operational document found",
            },
        ]
        precedent = {
            "exact_track_record": {"found": False, "note": "PLACEHOLDER — no prior proposal"},
            "semantic_precedent": {
                "found": False,
                "memory_id": None,
                "risk_type": "PLACEHOLDER_RISK_TYPE",
                "recorded_at": None,
                "strength": "none",
                "reason": "PLACEHOLDER — no semantic precedent",
            },
        }
        evidence_coverage = {"criteria_total": 2, "criteria_verified": 1}

        audits[cand["supplier_id"]] = {
            "criteria": criteria,
            "precedent": precedent,
            "evidence_coverage": evidence_coverage,
        }

        await _emit(
            config, session_id, "candidate_audited", layer=2,
            supplier_id=cand["supplier_id"],
            criteria=criteria,
            precedent=precedent,
            evidence_coverage=evidence_coverage,
        )

    await _emit(
        config, session_id, "layer_completed", layer=2,
        summary=f"{len(candidates)} candidates audited (placeholder)",
    )

    return {"audits": audits}


# ---------------------------------------------------------------------------
# Layer 3 — Close
# ---------------------------------------------------------------------------
async def close_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Compute proximity, assemble the shortlist, persist pending approval.

    Real behaviour (later): $geoNear against suppliers for real proximity_km, then
    insertOne/updateOne into supplier_alternatives. Here: placeholder proximity and
    shortlist, real event shapes. ``approved_supplier_id`` is always null — approval
    is a human step, never set by the agent.
    """
    session_id = state["session_id"]
    candidates = state["candidates"]
    audits = state["audits"]

    await _emit(config, session_id, "layer_started", layer=3, label=_LAYER_LABELS[3])

    await _emit(
        config, session_id, "atlas_operation", layer=3,
        operation_type="$geoNear", collection="suppliers",
        description="Calculating real proximity to distribution center",
        metrics={"candidates_in": len(candidates), "candidates_out": len(candidates)},
    )
    await _emit(
        config, session_id, "atlas_operation", layer=3,
        operation_type="insertOne", collection="supplier_alternatives",
        description="Persisting shortlist, pending approval",
        metrics={"documents_written": 1},
    )

    proximity_km: dict = {}
    shortlist: list[dict] = []
    for cand in candidates:
        km = 0.0  # PLACEHOLDER — real $geoNear distance later
        proximity_km[cand["supplier_id"]] = km
        audit = audits.get(cand["supplier_id"], {})
        shortlist.append(
            {
                "supplier_id": cand["supplier_id"],
                "supplier_name": cand["supplier_name"],
                "location": cand["location"],
                "category": cand["category"],
                "proximity_km": km,
                "evidence_coverage": audit.get("evidence_coverage"),
                "precedent_summary": "none",  # PLACEHOLDER — derived from precedent later
                "criteria": audit.get("criteria", []),
            }
        )

    # Terminal result event — deliberately excludes reliability_score,
    # lead_time_days, capacity_pct, price_delta_pct (not part of this design).
    await _emit(
        config, session_id, "shortlist_ready", layer=3,
        evaluation_id_ref=state["evaluation_id_ref"],
        supplier_alternatives_id="ALT-PLACEHOLDER-000",
        approved_supplier_id=None,
        candidates=shortlist,
    )

    await _emit(
        config, session_id, "layer_completed", layer=3,
        summary=f"Shortlist of {len(shortlist)} ready (placeholder), pending approval",
    )

    return {
        "proximity_km": proximity_km,
        "shortlist": shortlist,
        "approved_supplier_id": None,
    }
