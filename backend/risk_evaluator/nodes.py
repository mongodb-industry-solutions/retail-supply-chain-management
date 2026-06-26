"""
Node functions for the risk evaluator LangGraph graph.

In LangGraph, a node is just an async Python function: it receives the current state dict
and returns a partial update — a plain dict containing only the keys it wants to change.
LangGraph merges that partial update back into the shared state before calling the next
node. There is no magic, no base class to extend, and no special return type required.

This graph uses five linear nodes (detect_conditions → match_suppliers → calculate_rpn →
retrieve_memory → generate_summary) rather than a ReAct-style loop, because the
execution path is fully predetermined.  ReAct loops let the LLM decide what tool to call
next, which is valuable when the right sequence of actions is unknown at design time.
Here, the sequence is fixed: you always need to find signals before you can match
suppliers, always need scores before you can check memory.  A straight pipeline is both
simpler and more auditable for this use case.

The LLM (Claude via LangChain) appears only in the final node, ``generate_summary``,
because that is the only step that requires natural language generation.  Every preceding
node is fully deterministic: ``detect_conditions`` runs a MongoDB equality filter,
``match_suppliers`` runs a geospatial or region query, ``calculate_rpn`` applies an RPN
formula with optional haversine decay, and ``retrieve_memory`` runs an Atlas Vector
Search to adjust scores based on historical episodes.  Keeping the LLM out of
deterministic steps avoids latency, cost, and non-determinism where they add no value.

Each node communicates progress to the HTTP layer through an ``asyncio.Queue`` passed in
via ``config["configurable"]["queue"]``.  Before doing its work a node puts a
``tool_start`` event on the queue; after finishing it puts a ``tool_end`` event.  The
FastAPI router drains this queue and forwards each event as a Server-Sent Event, so the
frontend can display a live step-by-step progress indicator while the graph is still
running.
"""

import logging
import time
from datetime import datetime
from math import atan2, cos, radians, sin, sqrt

from bson import ObjectId
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from core.config import get_settings
from core.db import get_database
from risk_evaluator.schemas import (
    EvaluationResult,
    OperationalContext,
    RiskEvaluatorState,
    RiskScore,
    SupplierEvaluation,
    TriggeredBy,
)

logger = logging.getLogger(__name__)

_CRITICALITY_RANK = {"high": 3, "medium": 2, "low": 1}
_RANK_TO_CRITICALITY = {3: "high", 2: "medium", 1: "low"}
_STATUS_RANK = {"CRITICAL": 4, "ALERT": 3, "WATCH": 2, "OK": 1}


def _serialize_doc(doc: dict) -> dict:
    out = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, dict):
            out[k] = _serialize_doc(v)
        elif isinstance(v, list):
            out[k] = [
                _serialize_doc(i) if isinstance(i, dict)
                else str(i) if isinstance(i, ObjectId)
                else i
                for i in v
            ]
        else:
            out[k] = v
    return out


def _rpn_status(rpn_dynamic: float, alert_threshold_rpn: float) -> str:
    if rpn_dynamic >= alert_threshold_rpn * 1.30:
        return "CRITICAL"
    if rpn_dynamic >= alert_threshold_rpn:
        return "ALERT"
    if rpn_dynamic >= alert_threshold_rpn * 0.70:
        return "WATCH"
    return "OK"


async def detect_conditions(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """
    Queries external_conditions for documents matching session_id and is_demo_trigger=True.
    Adds the list of triggered conditions to graph state.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Detecting active risk signals..."})

    db = await get_database()
    docs = await db["external_conditions"].find(
        {"session_id": state["session_id"], "is_demo_trigger": True}
    ).to_list(length=None)

    conditions = [_serialize_doc(doc) for doc in docs]

    await queue.put({"type": "tool_end", "message": "Detecting active risk signals..."})
    return {"conditions": conditions}


async def match_suppliers(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """
    For each triggered condition, queries suppliers by geo-search or region match,
    enriches each with operational context from purchase_orders, and deduplicates by supplier_id.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Matching exposed suppliers..."})

    if not state["conditions"]:
        await queue.put({"type": "tool_end", "message": "Matching exposed suppliers..."})
        return {"exposed_suppliers": {}}

    db = await get_database()
    exposed: dict = {}

    for signal in state["conditions"]:
        if signal.get("has_physical_location"):
            lng, lat = signal["epicentre"]["coordinates"]
            radius_radians = signal["impact_radius_km"] / 6378.1
            supplier_query = {
                "location": {
                    "$geoWithin": {"$centerSphere": [[lng, lat], radius_radians]}
                }
            }
        else:
            supplier_query = {"region": {"$in": signal["affected_regions"]}}

        matched = await db["suppliers"].find(supplier_query).to_list(length=None)

        for raw_supplier in matched:
            supplier_doc = _serialize_doc(raw_supplier)
            supplier_id = supplier_doc["supplier_id"]

            if supplier_id not in exposed:
                orders = await db["purchase_orders"].find(
                    {"supplier_id": supplier_id, "status": "active"}
                ).to_list(length=None)
                orders = [_serialize_doc(o) for o in orders]

                if orders:
                    min_order = min(orders, key=lambda o: o.get("days_until_due", 0))
                    days_until_due = min_order.get("days_until_due", 0)
                    earliest_delivery_due = min_order.get("delivery_due_date", "")
                    max_rank = max(
                        _CRITICALITY_RANK.get(o.get("criticality", "low"), 1)
                        for o in orders
                    )
                    criticality = _RANK_TO_CRITICALITY.get(max_rank, "low")
                else:
                    days_until_due = 0
                    earliest_delivery_due = ""
                    criticality = "low"

                exposed[supplier_id] = {
                    **supplier_doc,
                    "operational_context": {
                        "active_orders": len(orders),
                        "total_value_usd": sum(o.get("value_usd", 0) for o in orders),
                        "days_until_due": days_until_due,
                        "earliest_delivery_due": earliest_delivery_due,
                        "criticality": criticality,
                    },
                    "_matched_signals": [signal],
                }
            else:
                if signal not in exposed[supplier_id]["_matched_signals"]:
                    exposed[supplier_id]["_matched_signals"].append(signal)

    await queue.put({"type": "tool_end", "message": "Matching exposed suppliers..."})
    return {"exposed_suppliers": exposed}


async def calculate_rpn(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """
    Computes rpn_dynamic for each supplier-signal pair, applies haversine distance
    decay for geo-located signals, and assigns CRITICAL/ALERT/WATCH/OK status.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Calculating dynamic RPN scores..."})

    if not state["exposed_suppliers"]:
        await queue.put({"type": "tool_end", "message": "Calculating dynamic RPN scores..."})
        return {"risk_scores": {}}

    db = await get_database()
    risk_scores: dict = {}

    for supplier_id, supplier in state["exposed_suppliers"].items():
        scores = []
        for signal in supplier["_matched_signals"]:
            catalog = await db["risk_catalog"].find_one(
                {"risk_id": signal["risk_catalog_ref"]}
            )
            if catalog is None:
                continue

            condition_score = signal["condition_score"]
            rpn_dynamic = (
                catalog["severity"]
                * (catalog["occurrence_base"] * condition_score)
                * catalog["detection"]
            )

            distance_decay = None
            if signal.get("has_physical_location"):
                sup_coords = supplier["location"]["coordinates"]
                epi_coords = signal["epicentre"]["coordinates"]
                lat1 = radians(sup_coords[1])
                lon1 = radians(sup_coords[0])
                lat2 = radians(epi_coords[1])
                lon2 = radians(epi_coords[0])
                dlat = lat2 - lat1
                dlon = lon2 - lon1
                a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
                distance_km = 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
                distance_decay = max(
                    1.0 - (distance_km / signal["impact_radius_km"]) * 0.3, 0.7
                )
                rpn_dynamic = rpn_dynamic * distance_decay

            scores.append(
                RiskScore(
                    risk_id=catalog["risk_id"],
                    condition_id=signal["condition_id"],
                    rpn_base=catalog["rpn_base"],
                    rpn_dynamic=round(rpn_dynamic, 2),
                    rpn_status=_rpn_status(rpn_dynamic, catalog["alert_threshold_rpn"]),
                    triggered_by=TriggeredBy(
                        source=signal["source"],
                        condition_score=condition_score,
                        historical_weight=1.0,
                        distance_decay=distance_decay,
                    ),
                )
            )

        risk_scores[supplier_id] = scores

    await queue.put({"type": "tool_end", "message": "Calculating dynamic RPN scores..."})
    return {"risk_scores": risk_scores}


async def retrieve_memory(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """
    Runs a vector search on agent_memory for each supplier with a non-OK risk score,
    derives historical_weight from prior episode outcomes, and adjusts rpn_dynamic.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Retrieving historical memory..."})

    if not state["risk_scores"]:
        await queue.put({"type": "tool_end", "message": "Retrieving historical memory..."})
        return {"risk_scores": {}, "memory_episodes": {}}

    db = await get_database()
    updated_scores: dict = dict(state["risk_scores"])
    memory_episodes: dict = {}

    for supplier_id, scores in state["risk_scores"].items():
        if not any(s.rpn_status != "OK" for s in scores):
            continue

        supplier = state["exposed_suppliers"][supplier_id]
        signal = supplier["_matched_signals"][0]
        query_text = (
            f"{signal['risk_type_triggered']} risk affecting supplier in {supplier['region']}"
        )

        try:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": "agent_memory_autoembed_index",
                        "queryText": query_text,
                        "path": "auto_embed_text",
                        "numCandidates": 20,
                        "limit": 5,
                    }
                }
            ]
            episodes = await db["agent_memory"].aggregate(pipeline).to_list(length=None)
        except Exception as exc:
            logger.warning("Vector search failed for supplier %s: %s", supplier_id, exc)
            continue

        if episodes:
            occurred_any = any(
                doc.get("episode", {}).get("actual_impact", {}).get("occurred", False)
                for doc in episodes
            )
            historical_weight = 1.20 if occurred_any else 0.90
        else:
            historical_weight = 1.0

        adjusted = []
        for score in scores:
            catalog = await db["risk_catalog"].find_one({"risk_id": score.risk_id})
            alert_threshold = catalog["alert_threshold_rpn"] if catalog else None

            new_rpn = round(score.rpn_dynamic * historical_weight, 2)
            new_status = (
                _rpn_status(new_rpn, alert_threshold)
                if alert_threshold is not None
                else score.rpn_status
            )
            new_triggered_by = score.triggered_by.model_copy(
                update={"historical_weight": historical_weight}
            )
            adjusted.append(
                score.model_copy(
                    update={
                        "rpn_dynamic": new_rpn,
                        "rpn_status": new_status,
                        "triggered_by": new_triggered_by,
                    }
                )
            )

        updated_scores[supplier_id] = adjusted
        memory_episodes[supplier_id] = [_serialize_doc(ep) for ep in episodes]

    await queue.put({"type": "tool_end", "message": "Retrieving historical memory..."})
    return {"risk_scores": updated_scores, "memory_episodes": memory_episodes}


async def generate_summary(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """
    Calls Claude to produce a natural-language risk summary per supplier, inserts
    evaluation documents into supplier_risk_evaluations, and closes the SSE stream.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Generating risk summary..."})

    db = await get_database()
    llm = ChatAnthropic(
        model=get_settings().anthropic_model,
        api_key="placeholder",
        base_url=get_settings().llm_base_url,
        default_headers={"api-key": get_settings().llm_api_key},
    )

    _ALERT_STATUSES = {"CRITICAL", "ALERT", "WATCH"}
    _ACTION_STATUSES = {"CRITICAL", "ALERT"}

    evaluations = []
    evaluated_suppliers: list[SupplierEvaluation] = []

    for supplier_id, scores in state["risk_scores"].items():
        if not any(s.rpn_status in _ALERT_STATUSES for s in scores):
            continue

        supplier = state["exposed_suppliers"][supplier_id]
        episodes = state["memory_episodes"].get(supplier_id, [])
        op_ctx = supplier["operational_context"]

        score_lines = []
        for s in scores:
            headline_signal = next(
                (
                    sig for sig in supplier["_matched_signals"]
                    if sig["condition_id"] == s.condition_id
                ),
                supplier["_matched_signals"][0],
            )
            score_lines.append(
                f"  - risk_id={s.risk_id}, rpn_base={s.rpn_base}, "
                f"rpn_dynamic={s.rpn_dynamic}, rpn_status={s.rpn_status}, "
                f"condition_score={s.triggered_by.condition_score}, "
                f"historical_weight={s.triggered_by.historical_weight}, "
                f"headline={headline_signal.get('raw_headline', '')}"
            )

        memory_lines = []
        for ep in episodes:
            ep_data = ep.get("episode", {})
            impact = ep_data.get("actual_impact", {})
            memory_lines.append(
                f"  - condition_summary={ep_data.get('condition_summary', '')}, "
                f"occurred={impact.get('occurred', False)}, "
                f"delay_days={impact.get('delay_days', 'N/A')}, "
                f"cost_overrun_usd={impact.get('cost_overrun_usd', 'N/A')}, "
                f"action_taken={ep_data.get('action_taken', 'N/A')}"
            )

        prompt_parts = [
            f"Supplier: id={supplier_id}, name={supplier['supplier_name']}, "
            f"region={supplier['region']}, country={supplier['country']}, "
            f"categories={supplier['product_categories']}",
            "",
            "Risk scores:",
            *score_lines,
            "",
            f"Operational context: active_orders={op_ctx['active_orders']}, "
            f"total_value_usd={op_ctx['total_value_usd']}, "
            f"days_until_due={op_ctx['days_until_due']}, "
            f"criticality={op_ctx['criticality']}",
        ]
        if memory_lines:
            prompt_parts += ["", "Historical episodes:", *memory_lines]
        prompt_parts += [
            "",
            "Write a 3-5 sentence natural language summary of this supplier's current risk "
            "situation. State the risk level, what caused it, the financial and operational "
            "stakes, and whether historical precedent exists. Be direct and factual.",
        ]
        prompt = "\n".join(prompt_parts)

        response = await llm.ainvoke([
            SystemMessage(
                content=(
                    "You are a supply chain risk analyst. Write concise, factual summaries "
                    "for procurement managers. Be direct about severity and financial impact."
                )
            ),
            HumanMessage(content=prompt),
        ])
        natural_language_summary = response.content

        supplier_risk_level = max(
            (s.rpn_status for s in scores),
            key=lambda st: _STATUS_RANK.get(st, 0),
        )
        requires_action = any(s.rpn_status in _ACTION_STATUSES for s in scores)

        eval_doc = {
            "evaluation_id": (
                f"EVAL-{state['session_id'][:8]}-{supplier_id[-6:]}-{int(time.time())}"
            ),
            "supplier_id": supplier_id,
            "supplier_name": supplier["supplier_name"],
            "region": supplier["region"],
            "country": supplier["country"],
            "product_categories": supplier["product_categories"],
            "session_id": state["session_id"],
            "is_base": False,
            "evaluated_at": datetime.utcnow().isoformat() + "Z",
            "supplier_risk_level": supplier_risk_level,
            "requires_action": requires_action,
            "operational_context": op_ctx,
            "risk_scores": [s.model_dump() for s in scores],
            "natural_language_summary": natural_language_summary,
            "memory_episodes_used": [ep.get("memory_id", "") for ep in episodes],
        }

        await db["supplier_risk_evaluations"].insert_one(eval_doc)
        eval_doc = _serialize_doc(eval_doc)
        evaluations.append(eval_doc)

        evaluated_suppliers.append(
            SupplierEvaluation(
                supplier_id=supplier_id,
                supplier_name=supplier["supplier_name"],
                region=supplier["region"],
                country=supplier["country"],
                product_categories=supplier["product_categories"],
                supplier_risk_level=supplier_risk_level,
                requires_action=requires_action,
                operational_context=OperationalContext(**op_ctx),
                risk_scores=scores,
                natural_language_summary=natural_language_summary,
                session_id=state["session_id"],
            )
        )

    result = EvaluationResult(
        session_id=state["session_id"],
        conditions=state["conditions"],
        suppliers=evaluated_suppliers,
    )

    await queue.put({"type": "tool_end", "message": "Generating risk summary..."})
    await queue.put({"type": "agent_response", "data": result.model_dump()})
    await queue.put(None)

    return {"evaluations": evaluations}
