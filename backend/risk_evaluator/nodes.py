"""
Node functions for the risk evaluator LangGraph graph.

In LangGraph, a node is just an async Python function: it receives the current state dict
and returns a partial update — a plain dict containing only the keys it wants to change.
LangGraph merges that partial update back into the shared state before calling the next
node. There is no magic, no base class to extend, and no special return type required.

This graph uses five linear nodes (detect_conditions → match_suppliers → calculate_rpn →
reason_and_retrieve → generate_summary) rather than a ReAct-style loop, because the
execution path is fully predetermined.  ReAct loops let the LLM decide what tool to call
next, which is valuable when the right sequence of actions is unknown at design time.
Here, the sequence is fixed: you always need to find signals before you can match
suppliers, always need scores before you can check memory.  A straight pipeline is both
simpler and more auditable for this use case.

The LLM (Claude via LangChain) appears in two nodes.  ``reason_and_retrieve`` runs an
inner ReAct loop where Claude decides which Atlas tools to call (Vector Search on
``agent_memory``, Aggregation on ``purchase_orders``) to surface historical precedent and
derive a ``historical_weight`` per supplier.  ``generate_summary`` then calls Claude once
more to produce a plain-English risk narrative for each affected supplier.  Every other
node is fully deterministic: ``detect_conditions`` runs a MongoDB equality filter,
``match_suppliers`` runs a geospatial or region query, and ``calculate_rpn`` applies an
RPN formula with optional haversine decay.  Keeping the LLM out of those deterministic
steps avoids latency, cost, and non-determinism where they add no value.

Each node communicates progress to the HTTP layer through an ``asyncio.Queue`` passed in
via ``config["configurable"]["queue"]``.  Before doing its work a node puts a
``tool_start`` event on the queue; after finishing it puts a ``tool_end`` event.  The
FastAPI router drains this queue and forwards each event as a Server-Sent Event, so the
frontend can display a live step-by-step progress indicator while the graph is still
running.
"""

import ast
import json
import logging
import re
import time
from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt

from bson import ObjectId
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
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

# Numeric ranks allow max() comparisons on string severity labels, e.g. to pick
# the highest criticality across a supplier's active orders in match_suppliers.
_CRITICALITY_RANK = {"high": 3, "medium": 2, "low": 1}
_RANK_TO_CRITICALITY = {3: "high", 2: "medium", 1: "low"}

# Used in generate_summary to select the single highest rpn_status across all
# risk_scores for a supplier, which becomes that supplier's supplier_risk_level.
_STATUS_RANK = {"CRITICAL": 4, "ALERT": 3, "WATCH": 2, "OK": 1}

# ReAct format is enforced so the LLM cannot skip the Thought step or bundle
# multiple tool calls into one turn — each Action line maps to exactly one tool
# dispatch.  The Final Answer must be valid JSON so the result can be parsed
# deterministically without requiring a second LLM call to clean it up.
_REACT_SYSTEM_PROMPT = """\
You are a supply chain risk analyst agent. Use the available tools to retrieve historical \
memory and order details for exposed suppliers, then return risk weights.

Respond strictly in ReAct format — never skip Thought before Action or Final Answer:

  Thought: <your reasoning>
  Action: <one tool call>

or, when you have enough information:

  Thought: <reasoning>
  Final Answer: {"historical_weight": {"SUP-XXX": 1.2, ...}}

Available tools:
  search_supplier_memory(supplier_ids, query_text)
      Semantic search of past episodes for one or more suppliers at once.
      supplier_ids is a LIST, e.g. ["SUP-A", "SUP-B"]. Results are grouped by
      supplier_id so you can tell which episodes belong to which supplier.
  get_order_detail(supplier_ids)
      Retrieve active purchase orders for one or more suppliers at once.
      supplier_ids is a LIST. Results are grouped by supplier_id.
  search_combined_episodes(supplier_id, risk_types)
      Cross-supplier semantic search filtered by risk type list. Returns episodes
      from ANY supplier that experienced these risk types (each episode carries its
      own supplier_id).

Strategy — collect broadly first, then reason:
  1. START with search_combined_episodes for the active risk_type(s). This surfaces
     relevant historical precedent across all suppliers in a single call.
  2. THEN issue ONE batched search_supplier_memory and/or get_order_detail passing
     ALL exposed suppliers as the supplier_ids list — do NOT query suppliers one at a
     time. A single batched call covers every exposed supplier at once.
  3. Only use a single-element supplier_ids list to drill into one specific supplier
     when the batched results show you need more detail on it.
  4. Spend any remaining iterations reasoning and comparing the evidence you gathered
     to assign each supplier its weight — not on collecting one supplier at a time.

Rules:
  - Always start with Thought before any Action or Final Answer.
  - Issue exactly one tool call per Action line.
  - Final Answer must be valid JSON: {"historical_weight": {"SUP-XXX": 1.2, ...}}
  - Include EVERY exposed supplier in the Final Answer with an explicitly reasoned weight.
  - Weight > 1.0 means historical precedent amplifies risk; < 1.0 attenuates; 1.0 = neutral.
  - Omitting a supplier from Final Answer defaults that supplier to weight 1.0.\
"""


def _serialize_doc(doc: dict) -> dict:
    """Convert a MongoDB document to a JSON-serialisable dict.

    MongoDB returns ObjectId values for ``_id`` and DBRefs; they are not
    JSON-serialisable by default, which would crash the SSE encoder.  This helper
    converts ObjectIds (and any nested ones) to strings so any document can safely
    be placed into graph state or yielded as an SSE frame.
    """
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
    """Map a dynamic RPN score to a four-level status string.

    Thresholds relative to ``alert_threshold_rpn`` from the risk catalog:
    - CRITICAL : score ≥ 130 % of threshold — immediate escalation required.
    - ALERT    : score ≥ 100 % of threshold — action recommended.
    - WATCH    : score ≥  70 % of threshold — monitor closely.
    - OK       : score <  70 % of threshold — within normal operating range.
    """
    if rpn_dynamic >= alert_threshold_rpn * 1.30:
        return "CRITICAL"
    if rpn_dynamic >= alert_threshold_rpn:
        return "ALERT"
    if rpn_dynamic >= alert_threshold_rpn * 0.70:
        return "WATCH"
    return "OK"


async def search_supplier_memory(
    supplier_ids: list[str],
    query_text: str,
    atlas_ops_sink: list[dict],
) -> dict[str, list[dict]]:
    """Atlas Vector Search tool — retrieve historical episodes for one or more suppliers.

    One of the three Atlas tools the ReAct agent (``reason_and_retrieve``) can invoke.
    Runs a single ``$vectorSearch`` on the ``agent_memory`` collection filtered to the
    given ``supplier_ids`` via ``$in``, so all exposed suppliers can be covered in one
    batched call rather than one query per supplier.  ``queryText`` lets the Atlas
    autoembedding index (Voyage AI model) convert the text to a vector server-side, so no
    client-side embedding call is needed.  ``limit`` scales with the number of suppliers
    (5 per supplier) so a batched query still surfaces enough episodes to cover each one.

    Returns the episodes grouped by ``supplier_id`` (``{supplier_id: [episode, ...]}``) so
    the LLM can tell which episodes belong to which supplier.

    ``atlas_ops_sink`` is a mutable list shared with the caller.  Appending the operation
    descriptor here lets the router emit an ``atlas_operation`` SSE event without this
    tool needing any knowledge of the queue or HTTP layer.
    """
    atlas_ops_sink.append({
        "type": "atlas_operation",
        "feature": "Vector Search",
        "collection": "agent_memory",
        "detail": f"queryText semantic search — batch query for {len(supplier_ids)} suppliers",
    })
    db = await get_database()
    limit = max(5 * len(supplier_ids), 5)
    pipeline = [
        {
            "$vectorSearch": {
                "index": "agent_memory_autoembed_index",
                "query": {"text": query_text},
                "path": "auto_embed_text",
                "filter": {"supplier_id": {"$in": supplier_ids}},
                "numCandidates": max(limit * 10, 50),
                "limit": limit,
            }
        }
    ]
    docs = await db["agent_memory"].aggregate(pipeline).to_list(length=None)
    grouped: dict[str, list[dict]] = {}
    for d in docs:
        sd = _serialize_doc(d)
        grouped.setdefault(sd.get("supplier_id"), []).append(sd)
    return grouped


async def get_order_detail(
    supplier_ids: list[str],
    atlas_ops_sink: list[dict],
) -> dict[str, list[dict]]:
    """Atlas Aggregation tool — retrieve active purchase orders for one or more suppliers.

    One of the three Atlas tools the ReAct agent can invoke.  Runs a MongoDB
    Aggregation pipeline: ``$match`` filters to active orders for the given
    ``supplier_ids`` via ``$in``, ``$project`` returns only scheduling-relevant fields
    (supplier_id, order_id, product_category, value_usd, delivery_due_date,
    days_until_due), and ``$limit`` (10 per supplier) caps the result set.  The agent
    calls this to understand financial exposure and delivery urgency before committing to
    a ``historical_weight`` for each supplier.

    Returns the orders grouped by ``supplier_id`` (``{supplier_id: [order, ...]}``) so the
    LLM can tell which orders belong to which supplier.
    """
    atlas_ops_sink.append({
        "type": "atlas_operation",
        "feature": "Aggregation",
        "collection": "purchase_orders",
        "detail": f"active orders — batch query for {len(supplier_ids)} suppliers",
    })
    db = await get_database()
    pipeline = [
        {"$match": {"supplier_id": {"$in": supplier_ids}, "status": "active"}},
        {
            "$project": {
                "_id": 0,
                "supplier_id": 1,
                "order_id": 1,
                "product_category": 1,
                "value_usd": 1,
                "delivery_due_date": 1,
                "days_until_due": 1,
            }
        },
        {"$limit": max(10 * len(supplier_ids), 10)},
    ]
    docs = await db["purchase_orders"].aggregate(pipeline).to_list(length=None)
    grouped: dict[str, list[dict]] = {}
    for d in docs:
        sd = _serialize_doc(d)
        grouped.setdefault(sd.get("supplier_id"), []).append(sd)
    return grouped


async def search_combined_episodes(
    supplier_id: str,
    risk_types: list[str],
    atlas_ops_sink: list[dict],
) -> list[dict]:
    """Atlas Vector Search tool — find cross-supplier episodes by risk type.

    One of the three Atlas tools the ReAct agent can invoke.  Useful when there
    are no supplier-specific memories for the target supplier but similar risk events
    exist for other suppliers in ``agent_memory``.  Uses Atlas Vector Search with a
    ``risk_type`` pre-filter so the semantic search stays within the relevant risk
    category rather than returning loosely related episodes.
    """
    atlas_ops_sink.append({
        "type": "atlas_operation",
        "feature": "Vector Search",
        "collection": "agent_memory",
        "detail": f"cross-supplier episodes for risk types {risk_types}",
    })
    db = await get_database()
    query_text = f"Supply chain risk episodes involving {', '.join(risk_types)}"
    pipeline = [
        {
            "$vectorSearch": {
                "index": "agent_memory_autoembed_index",
                "query": {"text": query_text},
                "path": "auto_embed_text",
                "filter": {"risk_type": {"$in": risk_types}},
                "numCandidates": 100,
                "limit": 8,
            }
        }
    ]
    docs = await db["agent_memory"].aggregate(pipeline).to_list(length=None)
    return [_serialize_doc(d) for d in docs]


def _parse_action_args(action_str: str) -> list:
    """Extract positional arguments from a tool call string, e.g. fn("a", ["b", "c"]) → ["a", ["b", "c"]].

    Real LLM output is not reliably valid JSON: Claude frequently emits single-quoted
    strings (``fn('SUP-X', 'text')``) or bare, unquoted arguments
    (``fn(SUP-X, tariff history)``).  Strict ``json.loads`` rejects both, which used to
    leave the argument list empty and silently skip the tool call.  Parsing is therefore
    attempted in three widening passes, stopping at the first that succeeds:

    1. Strict JSON — handles double-quoted strings and nested lists (original behaviour).
    2. Python literal syntax (``ast.literal_eval``) — additionally tolerates single
       quotes and list/tuple literals.
    3. Manual top-level comma split — last resort for bare/unquoted arguments; splits on
       commas outside any bracket depth, drops a leading ``name=`` keyword prefix
       (Claude sometimes emits keyword-style calls), and recovers each token's literal
       value (list, quoted string) where possible, falling back to the stripped string.

    This only makes the parser more permissive about what the LLM already emits; the tool
    interfaces and the ReAct system prompt are unchanged.
    """
    inner = re.search(r"\((.+)\)\s*$", action_str, re.DOTALL)
    if not inner:
        return []
    raw = inner.group(1)

    # Pass 1: strict JSON (double quotes, nested lists).
    try:
        return json.loads(f"[{raw}]")
    except json.JSONDecodeError:
        pass

    # Pass 2: Python literals — tolerates single quotes and list/tuple syntax.
    try:
        return list(ast.literal_eval(f"[{raw}]"))
    except (ValueError, SyntaxError):
        pass

    # Pass 3: bare/unquoted args — split on top-level commas (respecting bracket depth),
    # then strip whitespace and any stray surrounding quotes.
    args: list = []
    depth = 0
    current = ""
    for ch in raw:
        if ch in "[{(":
            depth += 1
            current += ch
        elif ch in "]})":
            depth -= 1
            current += ch
        elif ch == "," and depth == 0:
            args.append(current)
            current = ""
        else:
            current += ch
    if current.strip():
        args.append(current)

    parsed: list = []
    for token in args:
        token = token.strip()
        # Drop a leading keyword-argument prefix like ``supplier_id=`` (but not ``==``).
        token = re.sub(r"^[A-Za-z_]\w*\s*=(?!=)\s*", "", token, count=1).strip()
        # Recover the token's literal value (quoted string, list) when possible.
        try:
            parsed.append(ast.literal_eval(token))
        except (ValueError, SyntaxError):
            parsed.append(token.strip("'\""))
    return parsed


def _coerce_id_list(arg) -> list[str]:
    """Normalise a tool's first argument into a list of supplier_id strings.

    The batched memory/order tools expect ``supplier_ids`` as a list, but the LLM may
    still emit a single bare id (``search_supplier_memory("SUP-A", ...)``) instead of a
    one-element list.  This coerces either shape to ``list[str]`` so a lone id is treated
    as a single-supplier drill-down rather than being dropped.
    """
    if isinstance(arg, (list, tuple)):
        return [str(x) for x in arg]
    return [str(arg)]


async def reason_and_retrieve(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """Run the inner ReAct (Reason + Act) loop to derive a historical_weight per supplier.

    Uses Claude to examine risk scores, query Atlas for historical evidence, and
    return a weight that amplifies or attenuates each supplier's ``rpn_dynamic``.
    The loop is capped at 4 iterations to bound latency and LLM cost.

    Each iteration Claude produces a ``Thought:`` line followed by either:
    - An ``Action:`` line naming one of three Atlas tools to call, or
    - A ``Final Answer:`` JSON object ``{"historical_weight": {"SUP-XXX": float}}``.

    Available Atlas tools:
    - ``search_supplier_memory``   — Vector Search on ``agent_memory`` (per supplier)
    - ``get_order_detail``         — Aggregation on ``purchase_orders`` (per supplier)
    - ``search_combined_episodes`` — Vector Search on ``agent_memory`` (cross-supplier)

    Each tool call appends an entry to ``atlas_ops_sink``; those entries are immediately
    forwarded to the SSE queue so the frontend sees which Atlas features were used in
    real time, not just at the end of the run.

    Any supplier not named in the Final Answer defaults to weight 1.0 (neutral).

    WHY ReAct inside a deterministic pipeline: the outer pipeline is fixed because the
    step sequence is always the same, but *which* memory to retrieve depends on what the
    scores show — for example, a CRITICAL earthquake score warrants a different query than
    a WATCH geopolitical score.  That contextual judgment belongs to the LLM, not hard-
    coded rules, which is why this single node uses an interactive loop while all others
    are fully deterministic.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Reasoning and retrieving memory..."})

    agent_thoughts: list[str] = list(state.get("agent_thoughts", []))
    atlas_ops_sink: list[dict] = list(state.get("atlas_operations", []))

    llm = ChatAnthropic(
        model=get_settings().anthropic_model,
        api_key="placeholder",
        base_url=get_settings().llm_base_url,
        default_headers={"api-key": get_settings().llm_api_key},
    )

    # ── build initial context prompt ─────────────────────────────────────────
    ctx: list[str] = ["Evaluate historical risk weights for the following suppliers:\n"]
    for supplier_id, scores in state["risk_scores"].items():
        supplier = state["exposed_suppliers"].get(supplier_id, {})
        op_ctx = supplier.get("operational_context", {})
        score_summary = ", ".join(
            f"{s.risk_id}={s.rpn_status}(rpn={s.rpn_dynamic})" for s in scores
        )
        ctx.append(
            f"Supplier: {supplier_id} | {supplier.get('supplier_name', '')} "
            f"| {supplier.get('region', '')}\n"
            f"  Risk scores: {score_summary}\n"
            f"  Active orders: {op_ctx.get('active_orders', 0)}, "
            f"total_value_usd={op_ctx.get('total_value_usd', 0)}, "
            f"days_until_due={op_ctx.get('days_until_due', 0)}\n"
        )

    ctx.append("Active conditions:")
    for cond in state["conditions"]:
        ctx.append(
            f"  - {cond.get('condition_id', '')} | {cond.get('risk_type_triggered', '')} "
            f"| score={cond.get('condition_score', '')} | {cond.get('raw_headline', '')}"
        )
    ctx.append(
        "\nFor each supplier with a non-OK risk score, use the tools to find historical "
        "precedent and derive a historical_weight. Return all weights in the Final Answer."
    )

    # Build initial messages list with system prompt and a summary of all exposed
    # suppliers + active conditions so Claude has full context before the first turn.
    messages: list = [
        SystemMessage(content=_REACT_SYSTEM_PROMPT),
        HumanMessage(content="\n".join(ctx)),
    ]

    historical_weights: dict[str, float] = {}

    # Accumulate the real memory episodes surfaced by the memory tools during the
    # loop, keyed by supplier_id then memory_id so repeated hits dedupe naturally.
    # Only search_supplier_memory / search_combined_episodes feed this; order-detail
    # results (no memory_id) are ignored.
    episodes_by_supplier: dict[str, dict[str, dict]] = {}

    # ReAct loop: at most 4 iterations to bound latency. Each iteration the LLM
    # either calls a tool (Action) or returns a Final Answer.
    # _final_iteration records which iteration produced the Final Answer, purely for
    # diagnostic logging so we can confirm all suppliers came from one shared loop pass.
    _final_iteration: int | None = None
    for _iteration in range(4):
        response = await llm.ainvoke(messages)
        text = response.content.strip()
        messages.append(AIMessage(content=text))

        # Extract and surface the Thought so the frontend can render the agent's
        # reasoning live via an agent_thought SSE event.
        thought_match = re.search(
            r"Thought:\s*(.+?)(?=\nAction:|\nFinal Answer:|$)", text, re.DOTALL
        )
        if thought_match:
            thought_text = thought_match.group(1).strip()
            agent_thoughts.append(thought_text)
            _thought_event = {"type": "agent_thought", "message": thought_text}
            atlas_ops_sink.append(_thought_event)
            await queue.put(_thought_event)

        # Final Answer terminates the loop. Parse the JSON weight map; any malformed
        # response leaves weights at their defaults rather than crashing the pipeline.
        final_match = re.search(r"Final Answer:\s*(\{.*\})", text, re.DOTALL)
        if final_match:
            try:
                payload = json.loads(final_match.group(1))
                historical_weights = {
                    k: float(v)
                    for k, v in payload.get("historical_weight", {}).items()
                }
            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                logger.warning("reason_and_retrieve: failed to parse Final Answer — %s", exc)
            _final_iteration = _iteration
            break

        # No Final Answer yet — expect an Action. Dispatch to the matching Atlas tool
        # and append the result as an Observation for the next iteration.
        action_match = re.search(r"Action:\s*(.+?)$", text, re.MULTILINE)
        if not action_match:
            break

        action_str = action_match.group(1).strip()
        observation: list[dict] | dict[str, list[dict]] = []
        _sink_len_before = len(atlas_ops_sink)

        try:
            if action_str.startswith("search_supplier_memory("):
                args = _parse_action_args(action_str)
                if len(args) >= 2:
                    observation = await search_supplier_memory(
                        _coerce_id_list(args[0]), str(args[1]), atlas_ops_sink
                    )
            elif action_str.startswith("get_order_detail("):
                args = _parse_action_args(action_str)
                if args:
                    observation = await get_order_detail(
                        _coerce_id_list(args[0]), atlas_ops_sink
                    )
            elif action_str.startswith("search_combined_episodes("):
                args = _parse_action_args(action_str)
                if len(args) >= 2:
                    risk_types = args[1] if isinstance(args[1], list) else [str(args[1])]
                    observation = await search_combined_episodes(
                        str(args[0]), risk_types, atlas_ops_sink
                    )
        except Exception as exc:
            logger.warning("reason_and_retrieve: tool '%s' failed — %s", action_str, exc)

        # Accumulate memory episodes returned by the two memory-search tools, deduped by
        # memory_id. Attribution differs by tool, keeping memory_episodes_used consistent
        # with the derived historical_weight:
        #   - search_supplier_memory: batched over a $in of the queried suppliers, so each
        #     episode's OWN supplier_id is guaranteed to be one of the queried suppliers
        #     and is the correct owner. The tool returns episodes already grouped by
        #     supplier_id; attribute each group to its own supplier_id.
        #   - search_combined_episodes: cross-supplier (filtered by risk_type, not
        #     supplier), so a precedent from supplier Y surfaced while evaluating supplier
        #     X is attributed to X (the queried supplier_id, args[0]) — unchanged Phase 1
        #     behaviour. Nothing is synthesised.
        if action_str.startswith("search_supplier_memory(") and isinstance(observation, dict):
            for _sid, _eps in observation.items():
                if not _sid:
                    continue
                for _ep in _eps:
                    _mid = _ep.get("memory_id")
                    if _mid:
                        episodes_by_supplier.setdefault(_sid, {})[_mid] = _ep
        elif action_str.startswith("search_combined_episodes(") and isinstance(observation, list):
            _q_args = _parse_action_args(action_str)
            _queried_sid = str(_q_args[0]) if _q_args else None
            if _queried_sid:
                for _ep in observation:
                    _mid = _ep.get("memory_id")
                    if _mid:
                        episodes_by_supplier.setdefault(_queried_sid, {})[_mid] = _ep

        for _new_op in atlas_ops_sink[_sink_len_before:]:
            if _new_op.get("type") == "atlas_operation":
                logger.info("[%s] atlas_op %s %s — %s", state["session_id"], _new_op["feature"], _new_op["collection"], _new_op["detail"])
            await queue.put(_new_op)

        # Feed the tool result back as a Human message so Claude can reason about
        # it in the next iteration before deciding on another Action or Final Answer.
        messages.append(HumanMessage(content=f"Observation: {json.dumps(observation)}"))

    # Capture which suppliers the LLM explicitly named in its Final Answer BEFORE the
    # setdefault below fills in neutral defaults — used only by the diagnostic log to
    # distinguish an LLM-derived weight from a 1.0 fallback.
    _weights_from_llm = set(historical_weights.keys())

    # Guarantee every scored supplier has a weight. Omission from the LLM's Final
    # Answer is treated as neutral (1.0), not an error — the pipeline continues safely.
    for supplier_id in state["risk_scores"]:
        historical_weights.setdefault(supplier_id, 1.0)

    # Diagnostic logging (no behaviour change): for each scored supplier, record the
    # derived historical_weight, the memory_id(s) surfaced/accumulated for that supplier
    # during the loop, whether the weight came from the LLM Final Answer or the 1.0
    # default, and the (single, shared) ReAct iteration in which the Final Answer landed.
    # NOTE: this is one shared ReAct loop for all suppliers — the LLM returns a single
    # Final Answer weight map, not a separate loop per supplier. Same weight across
    # suppliers is therefore expected if the LLM assigned them the same value; identical
    # memory_ids across suppliers would instead point to shared evidence, not per-supplier
    # reasoning.
    for supplier_id in state["risk_scores"]:
        _weight = historical_weights.get(supplier_id, 1.0)
        _mem_ids = list(episodes_by_supplier.get(supplier_id, {}).keys())
        logger.info(
            "[%s] historical_weight supplier=%s weight=%s memory_ids=%s "
            "from_llm_final_answer=%s final_iteration=%s",
            state["session_id"],
            supplier_id,
            _weight,
            _mem_ids,
            supplier_id in _weights_from_llm,
            _final_iteration,
        )

    # Apply the derived historical_weight to each supplier's risk scores. This mirrors
    # the formula in the (unused) retrieve_memory helper: rescale rpn_dynamic by the
    # weight, recompute rpn_status against the catalog threshold, and record the real
    # weight on triggered_by. A weight of 1.0 (the default) leaves values unchanged,
    # so suppliers with no derived weight behave exactly as before.
    db = await get_database()
    updated_scores: dict = dict(state["risk_scores"])
    for supplier_id, scores in state["risk_scores"].items():
        weight = historical_weights.get(supplier_id, 1.0)
        adjusted = []
        for score in scores:
            catalog = await db["risk_catalog"].find_one({"risk_id": score.risk_id})
            alert_threshold = catalog["alert_threshold_rpn"] if catalog else None
            new_rpn = round(score.rpn_dynamic * weight, 2)
            new_status = (
                _rpn_status(new_rpn, alert_threshold)
                if alert_threshold is not None
                else score.rpn_status
            )
            new_triggered_by = score.triggered_by.model_copy(
                update={"historical_weight": weight}
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

    # Expose the real episodes to generate_summary. Every scored supplier gets a key;
    # suppliers with no relevant precedent map to an empty list so the summary can
    # honestly report "no historical precedent" rather than fabricating one.
    memory_episodes: dict = {}
    for supplier_id in state["risk_scores"]:
        memory_episodes[supplier_id] = list(
            episodes_by_supplier.get(supplier_id, {}).values()
        )

    await queue.put({"type": "tool_end", "message": "Reasoning and retrieving memory..."})
    return {
        "agent_thoughts": agent_thoughts,
        "atlas_operations": atlas_ops_sink,
        "historical_weight": historical_weights,
        "risk_scores": updated_scores,
        "memory_episodes": memory_episodes,
    }


async def detect_conditions(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """Find the active risk signals for this session using an Atlas Query.

    Runs a MongoDB ``find`` with an equality filter on ``session_id`` and
    ``is_demo_trigger: true``.  The ``is_demo_trigger`` flag distinguishes
    simulation-seeded conditions (written by the ingestion slice) from the static
    base seed documents (``is_base: true``) that live in the same collection,
    ensuring only the signals generated for this specific session are evaluated.

    Emits an ``atlas_operation`` SSE event so the frontend can display which Atlas
    feature was used and how many conditions were found.
    """
    queue = config.get("configurable", {}).get("queue")
    logger.info("[%s] evaluate — pipeline started", state["session_id"])
    await queue.put({"type": "tool_start", "message": "Detecting active risk signals..."})

    db = await get_database()
    docs = await db["external_conditions"].find(
        {"session_id": state["session_id"], "is_demo_trigger": True}
    ).to_list(length=None)

    conditions = [_serialize_doc(doc) for doc in docs]

    _op = {
        "type": "atlas_operation",
        "feature": "Query",
        "collection": "external_conditions",
        "detail": f"{len(conditions)} active conditions found for session {state['session_id']}",
    }
    state["atlas_operations"].append(_op)
    logger.info("[%s] atlas_op %s %s — %s", state["session_id"], _op["feature"], _op["collection"], _op["detail"])
    await queue.put(_op)

    await queue.put({"type": "tool_end", "message": "Detecting active risk signals..."})
    return {"conditions": conditions, "atlas_operations": state["atlas_operations"]}


async def match_suppliers(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """Identify which suppliers are exposed to each active condition.

    Uses two code paths depending on the condition type:
    - **Atlas Geospatial** (``$geoWithin $centerSphere``) for conditions that carry
      physical coordinates (``has_physical_location: true``).  ``impact_radius_km`` is
      converted to radians by dividing by Earth's mean radius (6378.1 km), which is the
      unit MongoDB's ``$centerSphere`` operator requires.
    - Plain equality filter on ``region`` for non-physical conditions (e.g. trade
      disruptions or regulatory changes affecting an entire region).

    Suppliers matched by multiple signals are deduplicated by ``supplier_id``; additional
    matching signals are appended to the existing entry's ``_matched_signals`` list rather
    than creating duplicate state entries.

    Operational context (active_orders, total_value_usd, days_until_due, criticality) is
    enriched from ``purchase_orders`` exactly once per unique supplier to avoid redundant
    queries when a supplier is exposed to more than one condition.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Matching exposed suppliers..."})

    if not state["conditions"]:
        await queue.put({"type": "tool_end", "message": "Matching exposed suppliers..."})
        return {"exposed_suppliers": {}, "atlas_operations": state["atlas_operations"]}

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

        if signal.get("has_physical_location") and matched:
            _op = {
                "type": "atlas_operation",
                "feature": "Geospatial",
                "collection": "suppliers",
                "detail": (
                    f"$geoWithin $centerSphere for condition {signal['condition_id']}"
                    f" — {len(matched)} suppliers matched"
                ),
            }
            state["atlas_operations"].append(_op)
            logger.info("[%s] atlas_op %s %s — %s", state["session_id"], _op["feature"], _op["collection"], _op["detail"])
            await queue.put(_op)

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
    return {"exposed_suppliers": exposed, "atlas_operations": state["atlas_operations"]}


async def calculate_rpn(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """Compute rpn_dynamic for every supplier–signal pair using the FMEA RPN formula.

    For each pair, looks up ``severity``, ``occurrence_base``, ``detection``, and
    ``alert_threshold_rpn`` from the matching ``risk_catalog`` document (Atlas **Query**).

    For physical signals (``has_physical_location: true``), applies a haversine distance
    decay: suppliers closer to the epicentre receive a higher score; those near the edge
    of the impact radius receive a minimum decay factor of 0.70 so they are never
    completely discounted.

    ``historical_weight`` is intentionally NOT applied here.  It is determined by
    ``reason_and_retrieve`` in the next node, which first needs the base scores to decide
    which Atlas memory tools to call.  Separating the two steps keeps this node
    deterministic and the ReAct node focused on weight derivation.
    """
    queue = config.get("configurable", {}).get("queue")
    await queue.put({"type": "tool_start", "message": "Calculating dynamic RPN scores..."})

    if not state["exposed_suppliers"]:
        await queue.put({"type": "tool_end", "message": "Calculating dynamic RPN scores..."})
        return {"risk_scores": {}, "atlas_operations": state["atlas_operations"]}

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

            _op = {
                "type": "atlas_operation",
                "feature": "Query",
                "collection": "risk_catalog",
                "detail": (
                    f"risk rule lookup: {signal.get('risk_type_triggered', '')} "
                    f"for supplier {supplier_id}"
                ),
            }
            state["atlas_operations"].append(_op)
            logger.info("[%s] atlas_op %s %s — %s", state["session_id"], _op["feature"], _op["collection"], _op["detail"])
            await queue.put(_op)

            condition_score = signal["condition_score"]
            # rpn_dynamic = severity × (occurrence_base × condition_score) × detection
            # This is the standard FMEA formula. condition_score scales occurrence to the
            # magnitude of the current signal; distance_decay (applied below) and
            # historical_weight (applied in reason_and_retrieve) further adjust the result.
            rpn_dynamic = (
                catalog["severity"]
                * (catalog["occurrence_base"] * condition_score)
                * catalog["detection"]
            )

            distance_decay = None
            if signal.get("has_physical_location"):
                sup_coords = supplier["location"]["coordinates"]
                epi_coords = signal["epicentre"]["coordinates"]
                # Haversine formula: computes great-circle distance between supplier location
                # and signal epicentre. decay = max(1 - (dist/radius) * 0.3, 0.70) so that
                # suppliers at the edge of the impact zone still receive at least 70 % of the score.
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
                        # Sourced from the risk_catalog document's own risk_type, not the
                        # condition's risk_type_triggered — the two can differ in principle.
                        risk_type_triggered=catalog["risk_type"],
                    ),
                )
            )

        risk_scores[supplier_id] = scores

    await queue.put({"type": "tool_end", "message": "Calculating dynamic RPN scores..."})
    return {"risk_scores": risk_scores, "atlas_operations": state["atlas_operations"]}


async def retrieve_memory(state: RiskEvaluatorState, config: RunnableConfig) -> dict:
    """Single-pass vector search implementation — NOT wired into the current graph.

    This was the original approach for deriving ``historical_weight``: run one Atlas
    Vector Search per supplier with a non-OK score, check whether past episodes
    actually occurred, and apply a fixed multiplier (1.20 if occurred, 0.90 if not,
    1.0 if no episodes found).

    It has been superseded by ``reason_and_retrieve``, which runs an interactive ReAct
    loop and can call multiple Atlas tools (Vector Search, Aggregation) per supplier
    based on what the scores show.  The richer context produces more nuanced weights
    and surfaces the agent's reasoning as live SSE events.

    Kept here for reference; remove if the codebase is simplified in the future.
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
                        "query": {"text": query_text},
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
    """Write a natural-language risk narrative per supplier and persist the results.

    Calls Claude to produce a 3–5 sentence plain-English summary for each affected
    supplier, giving a procurement manager a digestible narrative of severity, cause,
    financial stakes, and historical precedent.  Only suppliers with at least one WATCH,
    ALERT, or CRITICAL score are processed; OK-only suppliers are skipped entirely.

    This is the only node that writes to MongoDB.  One document is inserted into
    ``supplier_risk_evaluations`` per evaluated supplier, containing the full risk scores,
    operational context, and the LLM-generated summary.  All other collections accessed
    by the pipeline are read-only.

    After writing all documents the node emits ``tool_end``, then the ``agent_response``
    SSE event carrying the full ``EvaluationResult``, and finally the ``None`` sentinel
    that signals the router's SSE generator to close the stream.
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

        evaluation_id = (
            f"EVAL-{state['session_id'][:8]}-{supplier_id[-6:]}-{int(time.time())}"
        )
        eval_doc = {
            "evaluation_id": evaluation_id,
            "supplier_id": supplier_id,
            "supplier_name": supplier["supplier_name"],
            "region": supplier["region"],
            "country": supplier["country"],
            "product_categories": supplier["product_categories"],
            "session_id": state["session_id"],
            "is_base": False,
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
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
                evaluation_id=evaluation_id,
                supplier_id=supplier_id,
                supplier_name=supplier["supplier_name"],
                region=supplier["region"],
                country=supplier["country"],
                product_categories=supplier["product_categories"],
                location=supplier["location"],
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
    for _sup in evaluated_suppliers:
        _score_str = ", ".join(
            f"{s.risk_id}:{s.rpn_status}={s.rpn_dynamic}" for s in _sup.risk_scores
        )
        logger.info(
            "[%s] agent_response  supplier=%s  risk_level=%s  scores=[%s]",
            state["session_id"], _sup.supplier_id, _sup.supplier_risk_level, _score_str,
        )
    await queue.put(None)

    return {"evaluations": evaluations}
