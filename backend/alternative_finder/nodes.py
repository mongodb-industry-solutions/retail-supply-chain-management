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

from datetime import datetime, timezone

from langchain_core.runnables import RunnableConfig

from alternative_finder.schemas import AlternativeFinderState

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


# ---------------------------------------------------------------------------
# Layer 0 — Plan
# ---------------------------------------------------------------------------
async def plan_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Synthesise a search plan from the referenced risk evaluation.

    Real behaviour (later): read the ``supplier_risk_evaluations`` document and the
    supplier's active ``purchase_orders``, then ask an LLM for exclusions, a doc-type
    hint, and a search profile. Here: placeholder plan, real event shapes.
    """
    session_id = state["session_id"]

    await _emit(config, session_id, "layer_started", layer=0, label=_LAYER_LABELS[0])

    # Layer 0 Atlas operations (placeholder metrics, real operation strings).
    await _emit(
        config, session_id, "atlas_operation", layer=0,
        operation_type="find", collection="supplier_risk_evaluations",
        description="Reading the real risk evaluation",
        metrics={"documents_read": 1},
    )
    await _emit(
        config, session_id, "atlas_operation", layer=0,
        operation_type="find", collection="purchase_orders",
        description="Checking active orders for time pressure",
        metrics={"documents_read": 1},
    )

    thought = (
        "[PLACEHOLDER] Excluding PLACEHOLDER regions due to the evaluated risk. "
        "Prioritising PLACEHOLDER evidence given the nature of the risk."
    )
    await _emit(
        config, session_id, "agent_thought", layer=0,
        step="plan_synthesis", text=thought,
    )

    plan = {
        "supplier_id": "SUP-PLACEHOLDER-000",
        "risk_types": ["PLACEHOLDER_RISK_TYPE"],
        "region_exclude": ["PLACEHOLDER"],
        "doc_type_hint": ["PLACEHOLDER_DOC_TYPE"],
        "profile_text": "[PLACEHOLDER] Search profile synthesised from the risk evaluation.",
    }

    await _emit(
        config, session_id, "layer_completed", layer=0,
        summary="Plan synthesised (placeholder): 1 region excluded, profile ready",
    )

    return {
        "supplier_id": plan["supplier_id"],
        "risk_types": plan["risk_types"],
        "region_exclude": plan["region_exclude"],
        "doc_type_hint": plan["doc_type_hint"],
        "profile_text": plan["profile_text"],
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
