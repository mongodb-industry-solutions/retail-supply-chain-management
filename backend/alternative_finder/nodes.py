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
from datetime import datetime, timezone

import httpx
from pymongo.errors import OperationFailure

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from core.config import get_settings
from core.db import get_database
from core.json_utils import _extract_json
from core.glossary import (
    ALTERNATIVE_FINDER_TERMS,
    SHARED_TERMS,
    get_definitions,
)
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
# project-level Voyage Model API key.
# Native $rerank rollout can vary by environment/cluster at any given time — this is expected
# for a Preview feature. This fallback chain (native -> external Voyage API -> fused order)
# keeps the pipeline resilient regardless of whether native $rerank is available here right
# now. See ADR-007.
_RERANK_MODEL = "rerank-2.5"
# The ONE server error that means "this deployment does not implement $rerank". Only this exact
# code triggers the tier-2 fallback; any other OperationFailure (bad path, missing field,
# auth, timeout) is a real bug or a real outage and is deliberately allowed to propagate.
_RERANK_UNSUPPORTED_CODE = 40324
# Tier-2 external reranker: Voyage AI's public rerank endpoint. Same model as the native
# stage, so tier 1 and tier 2 produce comparable orderings. The API key is read from
# settings at call time and is NEVER logged, echoed, or persisted.
_VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank"
_VOYAGE_RERANK_TIMEOUT_S = 10.0
# Which tier actually produced the ordering, surfaced in logs and in the $rerank
# atlas_operation event so a run is never silently un-reranked.
_RERANK_MODE_NATIVE = "native_in_database"
_RERANK_MODE_EXTERNAL = "external_voyage_api"
_RERANK_MODE_NONE = "none_fused_order"
# rankFusion weights: semantic profile match matters more than lexical overlap for sourcing.
_FUSION_WEIGHTS = {"vector": 0.7, "text": 0.3}
_FUSION_LIMIT = 50          # chunks kept from each search arm / fused output (README's "top 50")
_TARGET_CANDIDATES = 5      # distinct suppliers to hand to Layer 2 (README's "top 5")
# Capacity-margin gate: committed_capacity_pct is fraction of capacity already committed, so a
# lower value means more spare capacity to absorb reallocated volume. 0.90 keeps only suppliers
# with >=10% headroom. JUDGMENT CALL (no design doc specifies a threshold) — flagged in the
# stage report; real data ranges ~0.30-0.70 so this is permissive, not pool-emptying.
_CAPACITY_MAX = 0.90

# --- Layer 2 (reflect & critique) real-infra constants, confirmed live 2026-07-07 --
# agent_memory vector index (autoEmbed voyage-4 on auto_embed_text; filters supplier_id,
# risk_type) — READY on the cluster, never exercised by code before this stage.
_MEMORY_VECTOR_INDEX = "agent_memory_autoembed_index"
# supplier_documents citation fields DO NOT match the README contract 1:1. Confirmed
# against all 146 live docs (Stage 4.3): the collection has `filename` (not `source_file`),
# `page_ref` (not `page`), and no `excerpt` field at all (the citable text is `chunk_text`).
# We keep the contract's OUTPUT key names but populate them from these real fields — an
# explicit, documented mapping, not a silent rename. `valid_until`/`chunk_id`/`doc_type`
# exist as-named, as does `language` (BCP-47), which passes through unrenamed and is also
# copied to `excerpt_language` — see `_build_citation` for why those are two fields.
_CITATION_FIELD_MAP = {"source_file": "filename", "page": "page_ref"}  # excerpt <- chunk_text (sliced)
_EXCERPT_MAX_CHARS = 400

# The audit criteria we actually support, mapped to the real doc_type vocabulary that can
# back each. We do NOT invent criteria the corpus can't evidence — every doc_type here was
# confirmed present in supplier_documents (distinct(): certificate/audit_report/contract/
# email/sustainability_report).
_CRITERIA_DOC_TYPES = {
    "compliance_certification": ["certificate", "audit_report"],
    "operational_status": ["email", "contract"],
    "sustainability_practices": ["sustainability_report"],
}
_CRITERIA = list(_CRITERIA_DOC_TYPES.keys())

# --- Layer 3 (close) real-infra constants, confirmed live 2026-07-07 ---------------
# GeoJSON field on suppliers: `location` = {type: "Point", coordinates: [lng, lat]},
# backed by a `location_2dsphere` index (confirmed via index_information()). This is the
# ONLY geospatial field on suppliers and the same one risk_evaluator's $geoWithin uses.
_SUPPLIER_GEO_FIELD = "location"
_EARTH_RADIUS_M = 6378100.0  # metres; matches risk_evaluator's 6378.1 km sphere radius

# Distribution-center reference point for $geoNear proximity.
# ASSUMPTION — flagged, not silent. There is NO fixed DC coordinate anywhere in the
# system: no config value, no distribution_center/config collection, and risk_evaluator
# never uses one (its geospatial queries measure distance to risk *epicentres*, not a DC).
# The seed corpus references several FreshMart DCs by name only (Los Angeles, Chicago,
# Monterrey, Miami) with no coordinates. We pick FreshMart's Los Angeles DC — the most
# frequently referenced US import hub in the supplier_documents corpus — as a reasonable
# single reference point, and surface this assumption in the $geoNear atlas_operation
# event (reference_point.assumed = True) so it is visible to the frontend/manager, never
# passed off as a confirmed fixed location.
_DC_REFERENCE = {
    "name": "FreshMart Los Angeles DC (assumed)",
    "coordinates": [-118.2437, 34.0522],  # [lng, lat] — Los Angeles, CA
    "assumed": True,
}

# Bounded gap-resolution cap. JUDGMENT CALL (no prior doc fixed a number): at most ONE extra
# targeted supplier_documents lookup PER CANDIDATE (not per criterion), so a 5-candidate run
# runs at most 5 extra queries total. Rationale: the cost that must be bounded is per-run,
# it scales naturally with candidate count, and one lookup can surface any doc_type the
# highest-priority unresolved criterion needs. If the gap survives that single lookup, the
# criterion honestly stays "unknown" — no looping, no forced resolution.
_GAP_LOOKUPS_PER_CANDIDATE = 1


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


_GENERATE_SYSTEM_PROMPT = (
    "You are a sourcing analyst drafting evidence-based claims about a candidate alternative "
    "supplier. You are given ONLY the real document chunks on file for this supplier — no "
    "outside knowledge is allowed. For each audit criterion, decide whether the provided "
    "chunks support a positive claim.\n\n"
    "Criteria:\n"
    "- compliance_certification: quality/compliance certifications or audit results (e.g. ISO "
    "9001, third-party audit).\n"
    "- operational_status: current commercial/operational standing (active contract, recent "
    "operational correspondence).\n"
    "- sustainability_practices: environmental or sustainability commitments / reporting.\n\n"
    "HARD RULES:\n"
    "1. Every claim with status \"compliant\" MUST cite exactly one chunk_id from the provided "
    "chunks. No citation => status MUST be \"unknown\" and chunk_id null.\n"
    "2. Never assert something the chunks do not actually state. Use \"unknown\" liberally when "
    "evidence is thin — an honest unknown is correct, a fabricated claim is not.\n"
    "3. Do not use any knowledge beyond the provided chunks.\n\n"
    "Respond with ONLY a single JSON object, no prose:\n"
    "{\n"
    '  "reasoning": "<2-4 sentences on what evidence you found and what is missing>",\n'
    '  "claims": [\n'
    '    {"criterion": "<one of the three>", "status": "compliant|unknown", '
    '"chunk_id": "<cited chunk_id or null>", "claim": "<short claim, or why unknown>"}\n'
    "  ]\n"
    "}\n"
    "Include an entry for every criterion listed above."
)

_AUDIT_SYSTEM_PROMPT = (
    "You are a verification auditor. Given a set of drafted claims about a supplier, the FULL "
    "text of each cited chunk, and any historical precedent, verify each claim. You are the "
    "final authority on each criterion's status.\n\n"
    "HARD RULES:\n"
    "1. Never move a criterion toward \"compliant\" without a cited chunk whose text actually "
    "states it. If a claim's citation does not support it, downgrade to \"unknown\".\n"
    "2. If a cited chunk directly contradicts the claim (or a certificate is expired — you will "
    "be told when valid_until has passed), status is \"noncompliant\".\n"
    "3. \"unknown\" is the honest default when evidence is thin or missing.\n"
    "4. Precedent (prior track record / semantic precedent) is CONTEXT ONLY — it may inform "
    "your reasoning but MUST NOT be used as the citation that makes a criterion compliant.\n\n"
    "Allowed final status values: compliant, noncompliant, unknown.\n\n"
    "Respond with ONLY a single JSON object, no prose:\n"
    "{\n"
    '  "reasoning": "<2-4 sentences: what you confirmed, what you downgraded and why, and '
    'whether precedent supports or undercuts this candidate>",\n'
    '  "criteria": [\n'
    '    {"criterion": "<name>", "status": "compliant|noncompliant|unknown", '
    '"chunk_id": "<cited chunk_id or null>", "note": "<short justification>"}\n'
    "  ]\n"
    "}\n"
    "Include an entry for every criterion you were given."
)


# Allowed glossary term NAMES, sourced from the shared GLOSSARY (SHARED +
# ALTERNATIVE_FINDER subsets) instead of a hardcoded list, so the vocabulary
# stays in lockstep with core.glossary. The LLM only decides which of these it
# used; the definition wording is applied by code via get_definitions().
_SUMMARIZE_ALLOWED_TERMS: list[str] = SHARED_TERMS + ALTERNATIVE_FINDER_TERMS

_SUMMARIZE_SYSTEM_PROMPT = (
    "You are a sourcing analyst writing a short rationale for a RETAIL OPERATIONS MANAGER "
    "(no risk-management background) explaining why one candidate alternative supplier "
    "landed at its position in a ranked shortlist.\n\n"
    "Respond with ONLY a single JSON object, no prose outside it:\n"
    '{ "rationale": "<plain text, see rules>", "terms": ["<allowed term>", ...] }\n\n'
    "The rationale value is PLAIN TEXT ONLY. NO markdown: no *, no **, no #, no backticks, "
    "no bullet-point syntax. Plain sentences and newlines only.\n\n"
    "The rationale is ONE short paragraph (2-4 sentences) justifying THIS candidate's position:\n"
    "- If rank is 1: state explicitly that it is the TOP RECOMMENDATION, justified only by "
    "its OWN compliant criteria, precedent, and proximity. Do NOT reference other candidates.\n"
    "- If rank is greater than 1: justify from its OWN evidence first, then close with EXACTLY "
    "ONE sentence explaining why it ranks below the top candidate specifically (weaker evidence "
    "coverage, fewer compliant criteria, farther away, or weaker precedent — whichever the data "
    "shows). Never compare against any candidate other than the top one; never a pairwise sweep.\n"
    "- Use the internal terms verbatim where relevant (e.g. compliance_certification, "
    "evidence_coverage, proximity_km, exact_track_record). NEVER rewrite, simplify, or paraphrase "
    "the term itself inside the paragraph — the term stays exactly as-is; the glossary explains it.\n\n"
    "Do NOT write any glossary footer or definitions yourself — that is appended for you.\n\n"
    "'terms' — the list of allowed terms you actually used in the rationale:\n"
    "- Allowed terms (internal demo / risk-management vocabulary ONLY): "
    + ", ".join(_SUMMARIZE_ALLOWED_TERMS) + ".\n"
    "- List ONLY terms you actually used in the rationale; use an empty list if you used none.\n"
    "- Use each allowed term's EXACT wording verbatim, character for character — never alter, "
    "abbreviate, or misspell it (e.g. it is 'compliance_certification', never "
    "'compliant_certification').\n"
    "- Do NOT include MongoDB/Atlas/search concepts (vector search, autoEmbed, rankFusion, rerank, "
    "etc.) — out of scope, never list them."
)


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
async def _rerank_native(db, rank_fusion_stage: dict, query_text: str, num_docs: int) -> list[dict]:
    """TIER 1 — reranking inside the database, as one more aggregation stage.

    ``$rerank`` is chained AFTER ``$rankFusion`` in the OUTER pipeline. It is deliberately
    never placed inside ``$rankFusion.input.pipelines`` — the documented limitation is that
    ``$rerank`` cannot be used *for* ``$rankFusion``/``$scoreFusion`` input pipelines, while
    chaining it downstream is the pattern MongoDB recommends.

    Raises ``OperationFailure`` (including code 40324 when the deployment does not implement
    the stage) — the caller decides what to do with it.
    """
    return await db["supplier_documents"].aggregate([
        rank_fusion_stage,
        {"$limit": _FUSION_LIMIT},
        {
            "$rerank": {
                "query": {"text": query_text},
                "path": "chunk_text",
                "model": _RERANK_MODEL,
                "numDocsToRerank": num_docs,
            }
        },
        {"$project": {"_id": 0, "chunk_id": 1, "supplier_id": 1, "doc_type": 1}},
    ]).to_list(length=None)


async def _rerank_external_voyage(db, fused: list[dict], query_text: str) -> list[dict] | None:
    """TIER 2 — same model, called over HTTP instead of in-database.

    Returns the fused chunks reordered by Voyage's relevance score, or ``None`` when this tier
    is unavailable for ANY reason (key not configured, network error, rate limit, invalid key,
    timeout, unexpected payload). ``None`` means "fall through to tier 3"; this function never
    raises, because a reranking *preference* must not be able to fail a sourcing run.

    The chunk text is fetched lazily here rather than widened into the Layer-1 projection, so
    the in-database path never pays to ship chunk text it does not need.

    Chunks whose ``chunk_text`` is empty/missing are not sent to the API (the endpoint rejects
    empty documents); they are appended after the reranked ones, preserving their fused order.

    SECURITY: the API key is read from settings, passed only in the request header, and never
    logged. Failure logging is limited to the exception type and, for HTTP errors, the status
    code — response bodies are deliberately NOT logged, since a provider error body is an
    uncontrolled string that could echo request material.
    """
    settings = get_settings()
    api_key = settings.voyage_api_key_fallback
    if not api_key:
        logger.info(
            "rerank tier 2 skipped: no fallback Voyage API key configured "
            "(set VOYAGE_API_KEY_FALLBACK to enable the external reranker)"
        )
        return None

    ids = [c["chunk_id"] for c in fused if c.get("chunk_id")]
    if not ids:
        return None
    text_rows = await db["supplier_documents"].find(
        {"chunk_id": {"$in": ids}}, {"_id": 0, "chunk_id": 1, "chunk_text": 1}
    ).to_list(length=None)
    text_by_id = {r["chunk_id"]: (r.get("chunk_text") or "") for r in text_rows}

    rerankable = [c for c in fused if text_by_id.get(c.get("chunk_id"), "").strip()]
    leftover = [c for c in fused if not text_by_id.get(c.get("chunk_id"), "").strip()]
    if not rerankable:
        logger.warning("rerank tier 2 skipped: no fused chunk carried usable chunk_text")
        return None

    documents = [text_by_id[c["chunk_id"]] for c in rerankable]
    try:
        async with httpx.AsyncClient(timeout=_VOYAGE_RERANK_TIMEOUT_S) as client:
            response = await client.post(
                _VOYAGE_RERANK_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "query": query_text,
                    "documents": documents,
                    "model": _RERANK_MODEL,
                    "top_k": len(documents),
                },
            )
        response.raise_for_status()
        results = response.json()["data"]
    except httpx.HTTPStatusError as exc:
        # Status code only — never the response body.
        logger.warning(
            "rerank tier 2 failed: external reranker returned HTTP %s; falling back to fused order",
            exc.response.status_code,
        )
        return None
    except Exception as exc:  # network, timeout, malformed payload, missing key in response
        logger.warning(
            "rerank tier 2 failed: %s; falling back to fused order", type(exc).__name__
        )
        return None

    try:
        ordered_idx = [
            int(r["index"])
            for r in sorted(results, key=lambda r: r.get("relevance_score", 0.0), reverse=True)
        ]
    except (TypeError, KeyError, ValueError) as exc:
        logger.warning(
            "rerank tier 2 failed: unexpected response shape (%s); falling back to fused order",
            type(exc).__name__,
        )
        return None

    # Defensive on both sides: a repeated index must not duplicate a chunk, and an index the
    # API omitted must not lose one. Output is always a permutation of the input.
    reordered: list[dict] = []
    used: set[int] = set()
    for i in ordered_idx:
        if 0 <= i < len(rerankable) and i not in used:
            used.add(i)
            reordered.append(rerankable[i])
    reordered += [c for i, c in enumerate(rerankable) if i not in used]
    return reordered + leftover


async def _rerank_chunks(
    db, fused: list[dict], rank_fusion_stage: dict, query_text: str
) -> tuple[list[dict], str]:
    """Order the fused chunks using the best reranker actually available.

    Three tiers, tried in order, returning ``(ordered_chunks, mode)`` so the caller can report
    which one ran:

      1. ``_RERANK_MODE_NATIVE``   — in-database ``$rerank``.
      2. ``_RERANK_MODE_EXTERNAL`` — Voyage AI HTTP API, same model. Reached ONLY when tier 1
         fails with ``OperationFailure`` code 40324 ("Unrecognized pipeline stage name"),
         i.e. the deployment does not implement the stage. Every other ``OperationFailure``
         propagates, because it means something is genuinely wrong with the query or cluster
         and silently degrading would hide it.
      3. ``_RERANK_MODE_NONE``    — the ``$rankFusion`` fused order, unchanged. Sanctioned
         fallback per ADR-007 lines 93-98. Never raises.
    """
    if not fused:
        return [], _RERANK_MODE_NONE

    try:
        reranked = await _rerank_native(db, rank_fusion_stage, query_text, len(fused))
        logger.info("rerank tier 1 used: native in-database $rerank (%d chunks)", len(reranked))
        return reranked, _RERANK_MODE_NATIVE
    except OperationFailure as exc:
        if exc.code != _RERANK_UNSUPPORTED_CODE:
            raise
        logger.warning(
            "rerank tier 1 unavailable: this deployment does not implement $rerank "
            "(OperationFailure code %s); trying the external reranker",
            _RERANK_UNSUPPORTED_CODE,
        )

    external = await _rerank_external_voyage(db, fused, query_text)
    if external is not None:
        logger.info("rerank tier 2 used: external Voyage API (%d chunks)", len(external))
        return external, _RERANK_MODE_EXTERNAL

    logger.warning(
        "rerank tier 3 used: no reranker available, serving $rankFusion fused order unchanged "
        "(%d chunks)", len(fused)
    )
    return fused, _RERANK_MODE_NONE


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
            f"requiring >={round((1 - _CAPACITY_MAX) * 100)}% capacity headroom"
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

    # --- 3. rerank, via the best tier available (see _rerank_chunks) -------------------
    reranked, rerank_mode = await _rerank_chunks(
        db, fused, _rank_fusion_stage(), query_text
    )

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

    # The description must state which tier actually ran — claiming "in-cluster, no external
    # call" while the external fallback is in use would be a false statement to the operator.
    _RERANK_DESCRIPTIONS = {
        _RERANK_MODE_NATIVE: (
            "Native Voyage reranking (in-cluster, no external call), narrowing to top "
            f"{_TARGET_CANDIDATES} suppliers"
        ),
        _RERANK_MODE_EXTERNAL: (
            "Native $rerank unavailable on this deployment — reranked via an external "
            f"Voyage AI API call, narrowing to top {_TARGET_CANDIDATES} suppliers"
        ),
        _RERANK_MODE_NONE: (
            "No reranker available — serving the $rankFusion fused order unchanged, "
            f"narrowing to top {_TARGET_CANDIDATES} suppliers"
        ),
    }
    await _emit(
        config, session_id, "atlas_operation", layer=1,
        operation_type="$rerank", collection="supplier_documents",
        description=_RERANK_DESCRIPTIONS[rerank_mode],
        metrics={
            "candidates_in": len(fused),
            "candidates_out": len(candidates),
            "rerank_mode": rerank_mode,
        },
    )

    await _emit(
        config, session_id, "layer_completed", layer=1,
        summary=f"{len(candidates)} candidates selected from {corpus_size} document chunks",
    )

    return {"candidates": candidates}


# ---------------------------------------------------------------------------
# Layer 2 — Reflect & Critique
# ---------------------------------------------------------------------------
def _parse_valid_until(value) -> datetime | None:
    """Parse a supplier_documents ``valid_until`` value (ISO string or datetime) to an
    aware datetime, or ``None`` if absent/unparseable. Used for the deterministic expiry
    guard in the audit pass."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _build_citation(chunk: dict) -> dict:
    """Build a contract-shaped citation from a real ``supplier_documents`` chunk.

    The contract keys ``source_file`` / ``page`` / ``excerpt`` have no same-named field in
    the live collection; they are populated from the real fields ``filename`` / ``page_ref``
    / ``chunk_text`` (sliced) per ``_CITATION_FIELD_MAP``. ``chunk_id`` / ``doc_type`` /
    ``valid_until`` / ``language`` exist as-named. This mapping is explicit and reported,
    not silent.

    ``language`` and ``excerpt_language`` are both the chunk's BCP-47 tag today, and are kept
    as two fields on purpose: ``language`` describes the source document, ``excerpt_language``
    the text actually quoted in ``excerpt``. They diverge the moment an excerpt is translated
    or summarised, and a consumer that conflates them would then mislabel the quote.
    """
    text = chunk.get("chunk_text", "") or ""
    language = chunk.get("language")
    return {
        "chunk_id": chunk.get("chunk_id"),
        "doc_type": chunk.get("doc_type"),
        "source_file": chunk.get("filename"),
        "page": chunk.get("page_ref"),
        "excerpt": text[:_EXCERPT_MAX_CHARS] + ("…" if len(text) > _EXCERPT_MAX_CHARS else ""),
        "valid_until": chunk.get("valid_until"),
        "language": language,
        # excerpt is a verbatim slice of chunk_text, so it is in the document's language.
        "excerpt_language": language,
    }


_CHUNK_PROJECTION = {
    "_id": 0, "chunk_id": 1, "doc_type": 1, "chunk_text": 1,
    "filename": 1, "page_ref": 1, "valid_until": 1, "supplier_id": 1,
    # `language` rides along here so the citation can name the language it quotes without a
    # second query: this is the only projection that feeds `_build_citation` (the Layer-1
    # funnel projections stop at chunk_id/supplier_id/doc_type and never reach it).
    "language": 1,
}


async def _fetch_supplier_chunks(db, supplier_id: str, doc_types: list[str] | None = None) -> list[dict]:
    """Real ``find`` on ``supplier_documents`` scoped to ONE supplier (never the Layer 1
    pool). Optionally narrowed to specific ``doc_type``s for a targeted gap lookup. Suppliers
    carry only a handful of chunks, so the full set is returned for grounding."""
    q: dict = {"supplier_id": supplier_id}
    if doc_types:
        q["doc_type"] = {"$in": doc_types}
    return await db["supplier_documents"].find(q, _CHUNK_PROJECTION).to_list(length=None)


async def reflect_critique_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Generate cited claims per candidate, then audit them — Stage 4.3 (real).

    Per candidate: one Generate LLM call (drafts claims grounded ONLY in real chunks
    retrieved for that specific supplier_id), a bounded gap-resolution lookup, then one
    Audit LLM call (verifies each citation actually supports the claim, applies a
    deterministic expiry guard, and weighs precedent). Two separate precedent mechanisms
    are looked up against ``agent_memory`` — exact track record (``find`` on
    ``episode.resolution.alt_supplier_id``) and cross-supplier semantic precedent
    (``$vectorSearch`` by ``risk_type``) — kept as separate objects, never merged.

    Gap resolution is capped at ``_GAP_LOOKUPS_PER_CANDIDATE`` extra query per candidate
    (see constant): after Generate reveals which criteria lack a citation, at most one
    targeted lookup runs (before Audit, so the single Audit call is authoritative over the
    gap-resolved evidence — a deliberate ordering choice, flagged in the stage report). If
    the gap survives, the criterion honestly stays "unknown".
    """
    session_id = state["session_id"]
    candidates = state["candidates"]
    risk_types = state.get("risk_types", [])
    profile_text = state.get("profile_text", "").strip()

    await _emit(config, session_id, "layer_started", layer=2, label=_LAYER_LABELS[2])

    db = await get_database()
    llm = _make_llm()
    candidate_ids = [c["supplier_id"] for c in candidates]

    # --- Precedent lookups (once per run, two SEPARATE mechanisms) --------------------
    # 1. Exact track record: real find on episode.resolution.alt_supplier_id. NOTE: no index
    #    exists on that path (only _id + supplier_id_1_risk_type_1) — collection scan, but the
    #    collection is tiny (5 docs). Reported as the Stage 4.1 open question.
    exact_by_alt: dict = {}
    if candidate_ids:
        mem_hits = await db["agent_memory"].find(
            {"episode.resolution.alt_supplier_id": {"$in": candidate_ids}}
        ).sort("recorded_at", -1).to_list(length=None)
        for m in mem_hits:
            alt = m.get("episode", {}).get("resolution", {}).get("alt_supplier_id")
            if alt and alt not in exact_by_alt:  # keep most recent (sorted desc)
                exact_by_alt[alt] = m
    await _emit(
        config, session_id, "atlas_operation", layer=2,
        operation_type="find", collection="agent_memory",
        description=(
            "Checking if any candidate was proposed before "
            "(episode.resolution.alt_supplier_id) — collection scan, no index on this path"
        ),
        metrics={"documents_read": len(exact_by_alt)},
    )

    # 2. Semantic precedent: cross-supplier $vectorSearch by risk_type similarity. Run-level
    #    (about the risk situation, not one candidate) — attached identically to each
    #    candidate, kept SEPARATE from exact track record.
    semantic_hit: dict | None = None
    semantic_query = profile_text or f"{', '.join(risk_types)} supply chain risk precedent"
    if risk_types:
        try:
            sem = await db["agent_memory"].aggregate([
                {"$vectorSearch": {
                    "index": _MEMORY_VECTOR_INDEX,
                    "query": {"text": semantic_query},
                    "path": "auto_embed_text",
                    "filter": {"risk_type": {"$in": risk_types}},
                    "numCandidates": 50,
                    "limit": 3,
                }},
                {"$project": {
                    "_id": 0, "memory_id": 1, "supplier_id": 1, "risk_type": 1,
                    "recorded_at": 1, "auto_embed_text": 1,
                    "episode.resolution.outcome": 1, "proposal_quality": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }},
            ]).to_list(length=None)
        except Exception as e:  # index/feature issue surfaces as a reported data/infra gap
            logger.warning("reflect_critique_node: agent_memory $vectorSearch failed — %s", e)
            sem = []
        semantic_hit = sem[0] if sem else None
        sem_count = len(sem)
    else:
        sem_count = 0
    await _emit(
        config, session_id, "atlas_operation", layer=2,
        operation_type="$vectorSearch", collection="agent_memory",
        description=f"Cross-supplier semantic precedent search by risk_type {risk_types or '[]'}",
        metrics={"candidates_in": sem_count, "candidates_out": 1 if semantic_hit else 0},
    )

    def _semantic_precedent_obj() -> dict:
        if not semantic_hit:
            return {"found": False, "memory_id": None, "risk_type": None,
                    "recorded_at": None, "strength": "none",
                    "reason": "No agent_memory episode for the current risk_type(s)"}
        score = semantic_hit.get("score", 0.0) or 0.0
        strength = "moderate" if score >= 0.7 else "weak"
        return {
            "found": True,
            "memory_id": semantic_hit.get("memory_id"),
            "risk_type": semantic_hit.get("risk_type"),
            "recorded_at": semantic_hit.get("recorded_at"),
            "strength": strength,
            "score": round(float(score), 4),
            "reason": (
                f"Same risk_type ({semantic_hit.get('risk_type')}) precedent from "
                f"{semantic_hit.get('supplier_id')} — directional cross-supplier context, "
                "not candidate-specific confirmation"
            ),
        }

    audits: dict = {}
    gap_lookups_used = 0

    for cand in candidates:
        sid = cand["supplier_id"]

        # --- GENERATE: retrieve this supplier's real chunks, draft cited claims ----------
        chunks = await _fetch_supplier_chunks(db, sid)
        chunk_map = {c["chunk_id"]: c for c in chunks if c.get("chunk_id")}

        gen_payload = {
            "supplier_id": sid,
            "supplier_name": cand.get("supplier_name"),
            "criteria": _CRITERIA,
            "chunks": [
                {"chunk_id": c.get("chunk_id"), "doc_type": c.get("doc_type"),
                 "valid_until": c.get("valid_until"), "text": c.get("chunk_text")}
                for c in chunks
            ],
        }
        if chunks:
            gen_resp = await llm.ainvoke([
                SystemMessage(content=_GENERATE_SYSTEM_PROMPT),
                HumanMessage(content=json.dumps(gen_payload, default=str)),
            ])
            try:
                gen = _extract_json(gen_resp.content)
            except (json.JSONDecodeError, ValueError):
                gen = {"reasoning": "Generate output unparseable; defaulting all criteria to unknown.",
                       "claims": []}
            gen_reason = str(gen.get("reasoning", "")).strip()
            gen_claims = {c.get("criterion"): c for c in gen.get("claims", []) if c.get("criterion")}
        else:
            gen_reason = (
                f"No documents on file for {sid} — all criteria start unknown "
                "(real data-coverage gap, not a fabrication)."
            )
            gen_claims = {}

        # Validate: a claim may only cite a chunk_id that really exists for this supplier.
        draft_criteria = []
        for crit in _CRITERIA:
            claim = gen_claims.get(crit, {})
            cid = claim.get("chunk_id")
            status = claim.get("status", "unknown")
            if cid not in chunk_map:  # no real citation -> forced unknown
                cid, status = None, "unknown"
            if status not in ("compliant", "unknown"):
                status = "unknown"
            draft_criteria.append({"criterion": crit, "status": status,
                                   "chunk_id": cid, "claim": claim.get("claim", "")})

        await _emit(config, session_id, "agent_thought", layer=2, step="generate",
                    text=gen_reason or f"Drafted claims for {sid}.")
        await _emit(config, session_id, "candidate_generated", layer=2,
                    supplier_id=sid, supplier_name=cand["supplier_name"],
                    location=cand["location"], category=cand["category"])

        # --- BOUNDED GAP RESOLUTION: one targeted lookup for the top unresolved gap ------
        unresolved = [c["criterion"] for c in draft_criteria if c["chunk_id"] is None]
        if unresolved and gap_lookups_used < len(candidates) * _GAP_LOOKUPS_PER_CANDIDATE:
            gap_crit = unresolved[0]  # cap is per-candidate, so resolve the highest-priority one
            gap_doc_types = _CRITERIA_DOC_TYPES.get(gap_crit, [])
            await _emit(config, session_id, "tool_start", layer=2,
                        tool="search_supplier_documents",
                        args={"supplier_id": sid, "doc_type": gap_doc_types, "criterion": gap_crit})
            gap_chunks = await _fetch_supplier_chunks(db, sid, gap_doc_types)
            gap_lookups_used += 1
            for gc in gap_chunks:  # fold any newly found chunks into the evidence set
                if gc.get("chunk_id"):
                    chunk_map.setdefault(gc["chunk_id"], gc)
            await _emit(config, session_id, "tool_end", layer=2,
                        tool="search_supplier_documents",
                        result_summary=(
                            f"{len(gap_chunks)} {'/'.join(gap_doc_types)} chunk(s) found for {gap_crit}"
                            if gap_chunks else
                            f"No {'/'.join(gap_doc_types)} document on file for {sid} "
                            f"— {gap_crit} stays unknown"
                        ))

        # --- Precedent for this candidate (two separate objects) -------------------------
        exact_mem = exact_by_alt.get(sid)
        if exact_mem:
            res = exact_mem.get("episode", {}).get("resolution", {})
            exact_track_record = {
                "found": True,
                "memory_id": exact_mem.get("memory_id"),
                "proposed_for_supplier_id": exact_mem.get("supplier_id"),
                "outcome": res.get("outcome"),
                "proposal_quality": exact_mem.get("proposal_quality"),
                "recorded_at": exact_mem.get("recorded_at"),
                "note": "This candidate was proposed as an alternative in a prior episode",
            }
        else:
            exact_track_record = {"found": False, "note": "No prior proposal for this candidate"}
        precedent = {
            "exact_track_record": exact_track_record,
            "semantic_precedent": _semantic_precedent_obj(),
        }

        # --- AUDIT: verify claims against full chunk text + deterministic expiry guard ---
        now = datetime.now(timezone.utc)
        audit_evidence = []
        for c in draft_criteria:
            ev = {"criterion": c["criterion"], "drafted_status": c["status"],
                  "drafted_claim": c["claim"], "chunk_id": c["chunk_id"]}
            if c["chunk_id"] and c["chunk_id"] in chunk_map:
                ch = chunk_map[c["chunk_id"]]
                vu = _parse_valid_until(ch.get("valid_until"))
                ev["cited_chunk"] = {
                    "chunk_id": ch.get("chunk_id"), "doc_type": ch.get("doc_type"),
                    "text": ch.get("chunk_text"),
                    "valid_until": ch.get("valid_until"),
                    "expired": bool(vu and vu < now),
                }
            audit_evidence.append(ev)
        # Chunks discovered during gap resolution the LLM hasn't seen yet, so it can cite them.
        extra_chunks = [
            {"chunk_id": ch.get("chunk_id"), "doc_type": ch.get("doc_type"),
             "text": ch.get("chunk_text"), "valid_until": ch.get("valid_until")}
            for cid, ch in chunk_map.items()
            if cid not in {c["chunk_id"] for c in draft_criteria if c["chunk_id"]}
        ]
        audit_payload = {
            "supplier_id": sid,
            "drafted": audit_evidence,
            "additional_chunks_available": extra_chunks,
            "precedent": precedent,
            "note": "A cited chunk marked expired:true must not remain compliant.",
        }
        audit_resp = await llm.ainvoke([
            SystemMessage(content=_AUDIT_SYSTEM_PROMPT),
            HumanMessage(content=json.dumps(audit_payload, default=str)),
        ])
        try:
            aud = _extract_json(audit_resp.content)
        except (json.JSONDecodeError, ValueError):
            aud = {"reasoning": "Audit output unparseable; keeping only citation-backed drafts.",
                   "criteria": []}
        aud_reason = str(aud.get("reasoning", "")).strip()
        aud_by_crit = {c.get("criterion"): c for c in aud.get("criteria", []) if c.get("criterion")}

        # --- Assemble final criteria with hard guardrails --------------------------------
        final_criteria = []
        verified = 0
        for crit in _CRITERIA:
            verdict = aud_by_crit.get(crit, {})
            status = verdict.get("status", "unknown")
            cid = verdict.get("chunk_id")
            note = str(verdict.get("note", "")).strip()
            if status not in ("compliant", "noncompliant", "unknown"):
                status = "unknown"
            # Guardrail 1: no real citation -> cannot be compliant.
            if cid not in chunk_map:
                cid = None
                if status == "compliant":
                    status = "unknown"
            citation = None
            if cid and cid in chunk_map:
                ch = chunk_map[cid]
                citation = _build_citation(ch)
                # Guardrail 2: deterministic expiry — an expired citation can't be compliant.
                vu = _parse_valid_until(ch.get("valid_until"))
                if status == "compliant" and vu and vu < now:
                    status = "noncompliant"
                    note = (note + " " if note else "") + "Citation expired per valid_until."
            entry = {"criterion": crit, "status": status, "citation": citation}
            if citation is None:
                entry["note"] = note or "No supporting document found for this candidate"
            elif note:
                entry["note"] = note
            if citation is not None:
                verified += 1
            final_criteria.append(entry)

        evidence_coverage = {"criteria_total": len(_CRITERIA), "criteria_verified": verified}
        audits[sid] = {"criteria": final_criteria, "precedent": precedent,
                       "evidence_coverage": evidence_coverage}

        await _emit(config, session_id, "agent_thought", layer=2, step="audit",
                    text=aud_reason or f"Audited {sid}: {verified}/{len(_CRITERIA)} criteria evidence-backed.")
        await _emit(config, session_id, "candidate_audited", layer=2,
                    supplier_id=sid, criteria=final_criteria,
                    precedent=precedent, evidence_coverage=evidence_coverage)

    await _emit(
        config, session_id, "layer_completed", layer=2,
        summary=(
            f"{len(candidates)} candidate(s) audited; {gap_lookups_used} targeted "
            "gap-resolution lookup(s) run"
        ),
    )

    return {"audits": audits}


# ---------------------------------------------------------------------------
# Layer 3 — Close
# ---------------------------------------------------------------------------
def _precedent_summary(precedent: dict) -> str:
    """Collapse the two SEPARATE precedent objects into a single short display token for
    the shortlist card — WITHOUT merging their meaning. This is a presentation-only label
    (replaces the removed ``reliability_score``); the full, unmerged ``exact_track_record``
    / ``semantic_precedent`` objects still ride along on each candidate's ``criteria`` /
    ``candidate_audited`` payload untouched, per the design's "never merged into one score".

    Precedence: an exact prior proposal (candidate literally proposed before) outranks a
    directional cross-supplier semantic hit.
    """
    exact = (precedent or {}).get("exact_track_record", {})
    semantic = (precedent or {}).get("semantic_precedent", {})
    if exact.get("found"):
        return "exact_track_record"
    if semantic.get("found"):
        strength = semantic.get("strength", "weak")
        return f"{strength}_directional"
    return "none"


def _compliant_count(criteria: list[dict]) -> int:
    """Number of criteria whose final audited status is ``compliant`` — the primary
    ranking key. Deterministic count over the exact ``criteria`` list Layer 2 built."""
    return sum(1 for c in (criteria or []) if c.get("status") == "compliant")


def _coverage_ratio(evidence_coverage: dict | None) -> float:
    """``criteria_verified / criteria_total`` as the secondary ranking key. A missing or
    zero ``criteria_total`` yields 0.0 (no evidence backing => lowest, never a div-by-zero)."""
    ec = evidence_coverage or {}
    total = ec.get("criteria_total") or 0
    if not total:
        return 0.0
    return (ec.get("criteria_verified") or 0) / total


def _rank_sort_key(entry: dict):
    """Explicit ranking rule (see rank_assembly_node). Returned as a tuple consumed by a
    single ``sorted(..., reverse=False)`` call, so every component is oriented ascending:

      1. compliant criteria count — DESC (negated)
      2. evidence-coverage ratio  — DESC (negated)
      3. proximity_km             — ASC; a null distance (real geo gap) sorts LAST via +inf
         so a missing distance never wins a tiebreak.
    """
    proximity = entry.get("proximity_km")
    proximity_key = proximity if proximity is not None else float("inf")
    return (
        -_compliant_count(entry.get("criteria", [])),
        -_coverage_ratio(entry.get("evidence_coverage")),
        proximity_key,
    )


async def rank_assembly_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Compute proximity, then assemble and rank the shortlist — Layer 3 (deterministic).

    First of the three Close-stage nodes (split out of the former single ``close_node``).
    NO LLM call. Runs the ``$geoNear`` on ``suppliers`` (unchanged: real spherical distance
    from each candidate to the assumed distribution-center reference point, candidates
    missing ``location`` reported as ``proximity_km: null``), assembles each shortlist entry
    with the same fields as before, then applies the OFFICIAL ranking rule (see
    ``_rank_sort_key``) and stamps a 1-indexed integer ``rank`` on every entry so position is
    an explicit field, never just array order. Emits ``layer_started`` for Layer 3; the
    matching ``layer_completed`` is emitted by ``persist_node`` at the end of the stage.
    """
    session_id = state["session_id"]
    candidates = state["candidates"]
    audits = state["audits"]

    await _emit(config, session_id, "layer_started", layer=3, label=_LAYER_LABELS[3])

    db = await get_database()
    candidate_ids = [c["supplier_id"] for c in candidates]

    # --- $geoNear on suppliers --------------------------------------------------------
    # $geoNear MUST be the first stage. Restrict to the candidate pool via `query`; a
    # candidate lacking `location` simply won't be returned -> reported as a data gap.
    proximity_km: dict = {}
    if candidate_ids:
        geo_rows = await db["suppliers"].aggregate([
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": _DC_REFERENCE["coordinates"]},
                    "distanceField": "_dist_m",
                    "spherical": True,
                    "key": _SUPPLIER_GEO_FIELD,
                    "query": {"supplier_id": {"$in": candidate_ids}},
                }
            },
            {"$project": {"_id": 0, "supplier_id": 1, "_dist_m": 1}},
        ]).to_list(length=None)
        for row in geo_rows:
            dist_m = row.get("_dist_m")
            if dist_m is not None:
                proximity_km[row["supplier_id"]] = round(dist_m / 1000.0, 1)

    # Candidates with no distance returned = real geo data gap (null, not a placeholder).
    geo_gap_ids = [sid for sid in candidate_ids if sid not in proximity_km]

    await _emit(
        config, session_id, "atlas_operation", layer=3,
        operation_type="$geoNear", collection="suppliers",
        description=(
            "Calculating real spherical proximity from each candidate to the "
            f"distribution center ({_DC_REFERENCE['name']})"
            + (f" — {len(geo_gap_ids)} candidate(s) missing location data, reported as null"
               if geo_gap_ids else "")
        ),
        metrics={
            "candidates_in": len(candidate_ids),
            "candidates_out": len(proximity_km),
            "missing_location": len(geo_gap_ids),
        },
        reference_point=_DC_REFERENCE,  # carries assumed=True so the assumption is visible
    )

    # --- Assemble the shortlist (real proximity, real precedent summary) ---------------
    shortlist: list[dict] = []
    for cand in candidates:
        sid = cand["supplier_id"]
        audit = audits.get(sid, {})
        shortlist.append(
            {
                "supplier_id": sid,
                "supplier_name": cand["supplier_name"],
                "location": cand["location"],
                "category": cand["category"],
                "proximity_km": proximity_km.get(sid),  # None => real geo data gap
                "evidence_coverage": audit.get("evidence_coverage"),
                "precedent_summary": _precedent_summary(audit.get("precedent", {})),
                "criteria": audit.get("criteria", []),
            }
        )

    # --- Official ranking: sort by the explicit rule, then stamp a 1-indexed `rank` ----
    shortlist.sort(key=_rank_sort_key)
    for position, entry in enumerate(shortlist, start=1):
        entry["rank"] = position

    return {"proximity_km": proximity_km, "shortlist": shortlist}


def _fallback_rationale(entry: dict, total: int) -> str:
    """Deterministic plain-text rationale used when the LLM output cannot be parsed — never
    crashes the stream (mirrors the generate/audit parse fallbacks). No glossary footer."""
    ec = entry.get("evidence_coverage") or {}
    verified = ec.get("criteria_verified", 0)
    ctotal = ec.get("criteria_total", 0)
    proximity = entry.get("proximity_km")
    prox_txt = f"{proximity} km from the distribution center" if proximity is not None else "no proximity data on file"
    return (
        f"Ranked #{entry.get('rank')} of {total}: "
        f"{_compliant_count(entry.get('criteria', []))} criteria compliant, "
        f"{verified}/{ctotal} evidence-backed, {prox_txt}."
    )


async def summarize_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Generate a plain-text per-candidate rationale for the shortlist — Layer 3 (LLM).

    Second of the three Close-stage nodes. One LLM call PER candidate, given that
    candidate's rank, proximity_km, evidence_coverage, precedent, and criteria (the exact
    shapes ``reflect_critique_node`` / ``rank_assembly_node`` already built). For rank > 1
    the top candidate's key stats are passed so the model can add ONE bounded comparative
    sentence against the top pick only. ``entry["rationale"]`` is the PLAIN-TEXT narrative
    paragraph ONLY (no markdown, no appended footer); the definitions for the internal
    terms it used are attached separately as ``entry["glossary"]`` — a list of
    ``{"term", "definition"}`` dicts sourced from ``get_definitions`` — so the frontend can
    render them as structured data. On any parse failure the candidate falls back to a
    deterministic plain-text one-liner with an empty glossary (never crashes the stream).
    Emits one
    ``agent_thought`` (step ``summarize``) per candidate — no new SSE event type.
    """
    session_id = state["session_id"]
    shortlist = state["shortlist"]

    if not shortlist:
        return {"shortlist": shortlist}

    llm = _make_llm()
    total = len(shortlist)

    # Ranked #1 is the reference for every rank > 1 comparison (single top pick only).
    top = shortlist[0]
    top_stats = {
        "supplier_name": top.get("supplier_name"),
        "compliant_count": _compliant_count(top.get("criteria", [])),
        "evidence_coverage": top.get("evidence_coverage"),
        "proximity_km": top.get("proximity_km"),
        "precedent_summary": top.get("precedent_summary"),
    }

    new_thoughts = []
    for entry in shortlist:
        sid = entry["supplier_id"]
        rank = entry.get("rank")
        payload = {
            "supplier_name": entry.get("supplier_name"),
            "rank": rank,
            "total_candidates": total,
            "proximity_km": entry.get("proximity_km"),
            "evidence_coverage": entry.get("evidence_coverage"),
            "precedent": (state["audits"].get(sid, {}) or {}).get("precedent", {}),
            "criteria": entry.get("criteria", []),
            "top_candidate": None if rank == 1 else top_stats,
        }
        resp = await llm.ainvoke([
            SystemMessage(content=_SUMMARIZE_SYSTEM_PROMPT),
            HumanMessage(content=json.dumps(payload, default=str)),
        ])
        try:
            parsed = _extract_json(resp.content)
            rationale = str(parsed.get("rationale", "")).strip()
            terms = parsed.get("terms", [])
            if not isinstance(terms, list):
                terms = []
        except (json.JSONDecodeError, ValueError):
            rationale = ""
            terms = []
        if not rationale:
            rationale = _fallback_rationale(entry, total)
            glossary: list[dict] = []
        else:
            # Definitions come verbatim from GLOSSARY; the LLM only chose which
            # canonical keys it used (unknown/misspelled keys are silently dropped).
            # Kept as STRUCTURED DATA ({term, definition}) rather than flattened into the
            # rationale string, so the frontend renders each term separately (real bold)
            # instead of relying on a plain-text footer with fragile line breaks.
            definitions = get_definitions([str(t) for t in terms])
            glossary = [
                {"term": term, "definition": definition}
                for term, definition in definitions
            ]
        entry["rationale"] = rationale
        entry["glossary"] = glossary

        await _emit(config, session_id, "agent_thought", layer=3, step="summarize",
                    text=f"Rationale drafted for {entry.get('supplier_name', sid)} (rank {rank}).")
        new_thoughts.append({"step": "summarize", "text": rationale})

    return {
        "shortlist": shortlist,
        "agent_thoughts": state["agent_thoughts"] + new_thoughts,
    }


async def persist_node(state: AlternativeFinderState, config: RunnableConfig) -> dict:
    """Persist the ranked, rationalised shortlist pending human approval — Layer 3 (deterministic).

    Third of the three Close-stage nodes. NO LLM call. ``insertOne`` into
    ``supplier_alternatives`` (unchanged shape, now with per-candidate ``rank`` +
    ``rationale`` carried inside each ``candidates[]`` entry), emits the terminal
    ``shortlist_ready`` (unchanged event type, same ``candidates`` array) and the Layer 3
    ``layer_completed``. ``approved_supplier_id`` is ALWAYS null (human approval only);
    ``insertOne``, never upsert, so run history and the ``is_base`` baseline are preserved.
    """
    session_id = state["session_id"]
    shortlist = state["shortlist"]
    disrupted_supplier_id = state.get("supplier_id", "")
    risk_types = state.get("risk_types", [])
    evaluation_id_ref = state["evaluation_id_ref"]

    db = await get_database()
    geo_gap_count = sum(1 for entry in shortlist if entry.get("proximity_km") is None)

    # --- insertOne into supplier_alternatives -----------------------------------------
    # Shape note (reported in the stage deliverable): the ONE pre-existing document is an
    # `is_base` baseline (status "no_action_required", empty candidates). We keep its field
    # names where they carry over (evaluation_id_ref, blocked_supplier_id, is_base,
    # is_demo_trigger, session_id, status, candidates_evaluated/discarded, candidates,
    # discarded_candidates, approved_supplier_id, decision_deadline, created_at) and add
    # Stage-4 fields (risk_types, reference_point) the baseline never had. Deliberate
    # divergences: status -> "pending_approval"; is_base -> False; blocked_supplier_id ->
    # the disrupted supplier_id (baseline left it null); candidates carry the full real
    # shortlist. approved_supplier_id is ALWAYS null (human-only). insertOne, never upsert.
    now_iso = _now()
    alt_doc = {
        "evaluation_id_ref": evaluation_id_ref,
        "session_id": session_id,
        "blocked_supplier_id": disrupted_supplier_id or None,
        "is_base": False,
        "is_demo_trigger": False,
        "status": "pending_approval",
        "risk_types": risk_types,
        "reference_point": _DC_REFERENCE,
        "candidates_evaluated": len(shortlist),
        "candidates_discarded": 0,
        "candidates": shortlist,
        "discarded_candidates": [],
        "approved_supplier_id": None,   # NEVER set by the agent — human approval only
        "decision_deadline": None,
        "created_at": now_iso,
    }
    insert_result = await db["supplier_alternatives"].insert_one(alt_doc)
    supplier_alternatives_id = str(insert_result.inserted_id)

    await _emit(
        config, session_id, "atlas_operation", layer=3,
        operation_type="insertOne", collection="supplier_alternatives",
        description="Persisting shortlist as a new run, pending human approval",
        metrics={"documents_written": 1, "candidates_persisted": len(shortlist)},
    )

    # Terminal result event — deliberately excludes reliability_score,
    # lead_time_days, capacity_pct, price_delta_pct (not part of this design).
    await _emit(
        config, session_id, "shortlist_ready", layer=3,
        evaluation_id_ref=evaluation_id_ref,
        supplier_alternatives_id=supplier_alternatives_id,
        approved_supplier_id=None,
        candidates=shortlist,
    )

    await _emit(
        config, session_id, "layer_completed", layer=3,
        summary=(
            f"Shortlist of {len(shortlist)} persisted (id {supplier_alternatives_id}), "
            "pending approval"
            + (f"; {geo_gap_count} without proximity data" if geo_gap_count else "")
        ),
    )

    return {"approved_supplier_id": None}
