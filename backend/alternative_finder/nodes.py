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
    """Narrow the supplier universe to a small candidate set.

    Real behaviour (later): $match on suppliers, $rankFusion ($vectorSearch + $search)
    over supplier_documents, then native Voyage $rerank. No LLM here (funnel is
    deterministic), so no agent_thought events for this layer. Here: 2 placeholder
    candidates, real event shapes.
    """
    session_id = state["session_id"]

    await _emit(config, session_id, "layer_started", layer=1, label=_LAYER_LABELS[1])

    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$match", collection="suppliers",
        description="Filtering by category, excluded region, capacity margin",
        metrics={"candidates_in": 500, "candidates_out": 146},
    )
    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$rankFusion", collection="supplier_documents",
        description="Combining semantic and full-text search across 146 document chunks",
        metrics={"candidates_in": 146, "candidates_out": 50},
    )
    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$rerank", collection="supplier_documents",
        description="Native reranking, no external call, narrowing to top candidates",
        metrics={"candidates_in": 50, "candidates_out": 2},
    )

    candidates = [
        {
            "supplier_id": "SUP-PLACEHOLDER-001",
            "supplier_name": "Placeholder Supplier One",
            "location": "PLACEHOLDER City, PLACEHOLDER Country",
            "category": "PLACEHOLDER_CATEGORY",
        },
        {
            "supplier_id": "SUP-PLACEHOLDER-002",
            "supplier_name": "Placeholder Supplier Two",
            "location": "PLACEHOLDER City, PLACEHOLDER Country",
            "category": "PLACEHOLDER_CATEGORY",
        },
    ]

    await _emit(
        config, session_id, "layer_completed", layer=1,
        summary=f"{len(candidates)} candidates selected from 146 document chunks (placeholder)",
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
