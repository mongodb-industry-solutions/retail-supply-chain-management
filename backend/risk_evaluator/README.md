# `risk_evaluator` — dynamic RPN risk evaluation

A real LangGraph `StateGraph` that, for one demo session, detects the active
disruption signals, finds exposed suppliers, scores each (supplier, signal)
pair with a dynamic RPN, adjusts those scores using historical precedent
retrieved from `agent_memory`, and writes a natural-language risk evaluation
per supplier. Progress streams to the frontend over Server-Sent Events.

---

## The graph — 5 nodes, fixed linear sequence

The graph is a real `StateGraph` (`graph.py`) compiled **without a
checkpointer** — it runs in-memory per request, seeded with a fresh state each
time. There is **no conditional branching**; the order is always:

```
START → detect_conditions → match_suppliers → calculate_rpn → reason_and_retrieve → generate_summary → END
```

- **`detect_conditions`** — deterministic. `find` on `external_conditions`
  with `{"session_id": ..., "is_demo_trigger": true}` (the signals
  `ingestion_engine` planted).
- **`match_suppliers`** — deterministic. For each signal: physical signals
  (`has_physical_location: true`) use an Atlas **geospatial** query
  (`$geoWithin $centerSphere`) on `suppliers.location`; non-physical signals
  match by region (`{"region": {"$in": affected_regions}}`). Enriches each
  matched supplier with operational context from `purchase_orders`
  (`status: "active"`).
- **`calculate_rpn`** — deterministic. Looks up FMEA fields in `risk_catalog`
  and computes `rpn_dynamic = severity × (occurrence_base × condition_score) ×
  detection`, applying a haversine distance decay (floor 0.70) for physical
  signals. Sets `rpn_status` (CRITICAL/ALERT/WATCH/OK) against
  `alert_threshold_rpn`.
- **`reason_and_retrieve`** — the LLM ReAct loop (details below).
- **`generate_summary`** — the LLM narrative + the only DB write (details
  below).

Only the last two nodes use the LLM (Claude via LangChain). The first three
are fully deterministic.

---

## The ReAct loop (`reason_and_retrieve`)

This node derives a `historical_weight` per supplier that amplifies (`>1.0`)
or attenuates (`<1.0`) each supplier's `rpn_dynamic`.

- **It is one shared loop for the whole run — not per supplier.** A single
  loop runs, and the LLM returns one `Final Answer` weight map covering every
  scored supplier. Suppliers can legitimately share the same weight.
- **Max 4 iterations** (`for _iteration in range(4)`), to bound latency/cost.
- **Three read-only Atlas tools** the LLM may call:
  - `search_supplier_memory` — `$vectorSearch` on `agent_memory`, filtered
    `supplier_id $in` (batched across suppliers).
  - `search_combined_episodes` — `$vectorSearch` on `agent_memory`, filtered
    `risk_type $in` (cross-supplier precedent).
  - `get_order_detail` — aggregation on `purchase_orders` (active orders).
- **Parsing strategy (not structured output):** the LLM's raw text is parsed
  with regexes — `Thought:`, `Action:`, and `Final Answer:`. The Final Answer
  JSON is extracted with `re.search(r"Final Answer:\s*(\{.*\})")` and read with
  `json.loads`. Tool-call arguments are parsed in three widening passes
  (strict `json.loads` → `ast.literal_eval` → manual top-level comma split).
- **Failure fallback:** if the Final Answer can't be parsed, it logs a warning
  and leaves weights empty — it does **not** crash. Any supplier not named in
  the Final Answer defaults to `historical_weight = 1.0` (neutral). Tool
  exceptions are also caught and logged without breaking the graph.
- After the loop, each score's `rpn_dynamic` is rescaled by the weight and its
  `rpn_status` recomputed against the catalog threshold; the surfaced episodes
  are carried forward for the summary.

> **`retrieve_memory` is confirmed dead code.** A single-pass, one-query-per-
> supplier version still exists in `nodes.py` but is **not** added to the
> compiled graph and never runs. It was superseded by `reason_and_retrieve`
> and kept only for reference.

---

## Collections it touches

| Op | Collection | Where | Filter / capability |
|----|-----------|-------|--------------------|
| READ | `external_conditions` | detect_conditions | `{session_id, is_demo_trigger:true}` (Query) |
| READ | `suppliers` | match_suppliers | `$geoWithin $centerSphere` (Geospatial) or `{region:{$in}}` |
| READ | `purchase_orders` | match_suppliers, get_order_detail | `{supplier_id, status:"active"}`; aggregation in the tool |
| READ | `risk_catalog` | calculate_rpn, reason_and_retrieve | `{risk_id}` |
| READ | `agent_memory` | search_supplier_memory / search_combined_episodes | `$vectorSearch` (autoembed, `agent_memory_autoembed_index`), LLM-gated |
| **WRITE** | `supplier_risk_evaluations` | generate_summary | `insert_one` — one per non-OK supplier |

MongoDB capabilities used: Query, Geospatial (`$geoWithin $centerSphere`),
Aggregation, and `$vectorSearch` with Atlas server-side auto-embedding. **No**
`$rankFusion`, native `$rerank`, `$search`, or `$geoNear` in this module.
**`agent_memory` is read only — this module never writes to it.**

### What `generate_summary` writes

`generate_summary` calls Claude to write a summary per WATCH/ALERT/CRITICAL
supplier (OK-only suppliers are skipped), then a second LLM pass selects
glossary terms and cleans up the text (on failure it falls back to the draft
with an empty glossary). It **inserts a hand-built dict** into
`supplier_risk_evaluations` — **not** the `SupplierEvaluation` Pydantic model.
The persisted doc adds `is_base`, `evaluated_at`, and `memory_episodes_used`,
and **omits the `location`/GeoPoint** that the Pydantic model requires (that
field is present only in the SSE payload). So the schema describes the SSE
event, not the stored document.

---

## Invocation contract

- **Endpoint:** `POST /api/simulation/evaluate` (mounted in `main.py`).
- **Header:** `X-Session-ID` required → **HTTP 400** if missing/empty.
- **Request body:** none. (Call `/api/simulation/start` first so there are
  signals to read.)
- **Response:** an SSE stream (`EventSourceResponse`).

### SSE events actually emitted

Each frame is `data: <json>` with **no SSE `event:` field** — the client
switches on the JSON `type` key:

| `type` | Meaning |
|--------|---------|
| `tool_start` / `tool_end` | a node started / finished |
| `atlas_operation` | a MongoDB op ran (`feature` ∈ Query / Geospatial / Vector Search / Aggregation) |
| `agent_thought` | a ReAct `Thought:` line |
| `agent_response` | terminal result — `{"type":"agent_response","data": <EvaluationResult>}` |
| `error` | `{"type":"error","message": ...}` on any unhandled exception |
| *(none)* | a `None` sentinel is placed on the queue to close the stream |

```bash
curl -N -X POST http://localhost:8000/api/simulation/evaluate \
  -H "X-Session-ID: demo-session-123"
```

---

## Internal state notes

State is a `TypedDict` (`RiskEvaluatorState`) — type hints only, not enforced.
Two things worth knowing:

- **`historical_weight` (a state key) is dead state.** `reason_and_retrieve`
  returns it, but no downstream node reads `state["historical_weight"]`; the
  effective weight is carried on each `RiskScore.triggered_by.historical_weight`
  instead. (It is also not in the initial state dict.)
- No checkpointing — the whole run lives in memory for the duration of the
  request. Session isolation comes from the fresh per-request state plus
  `session_id` filtering on documents, not from a LangGraph checkpointer (see
  [ADR-004](../adrs/004-langgraph-checkpointing.md)).

---

## Cross-module dependencies

- Reads the `external_conditions` documents that `ingestion_engine` wrote
  (same `session_id`, `is_demo_trigger: true`).
- Its `supplier_risk_evaluations` output (keyed by `evaluation_id`) is what
  `alternative_finder` later reads via `evaluation_id_ref`.
- Does not import either other module.
