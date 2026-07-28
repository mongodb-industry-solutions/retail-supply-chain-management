# `alternative_finder` — validated alternative supplier search

A real LangGraph `StateGraph` that, given a single `evaluation_id_ref`, plans a
search from the referenced risk evaluation, narrows the supplier universe
entirely inside MongoDB (hybrid search + native rerank), audits each candidate
against its own cited documents and historical precedent, ranks the survivors
by proximity and evidence, writes a rationale, and persists a shortlist that
waits for human approval. Progress streams to the frontend over Server-Sent
Events.

This module is fully implemented and mounted — it is **not** a stub.

---

## Four conceptual layers, six graph nodes

The design is organised around four layers (Plan → Deterministic Funnel →
Reflect & Critique → Close), but **in code the Close layer is split into three
nodes**, so the compiled `StateGraph` has **six** sequential nodes (no
conditional branching, no checkpointer — in-memory per request):

```
plan_node → funnel_node → reflect_critique_node → rank_assembly_node → summarize_node → persist_node
```

| Node | Layer | LLM? | What it does |
|------|-------|------|--------------|
| `plan_node` | Plan | 1 call | Reads the referenced `supplier_risk_evaluations` doc, resolves risk types/regions via `risk_catalog`, checks `purchase_orders` for time pressure, then one structured LLM call produces `region_exclude` / `doc_type_hint` / `profile_text`. |
| `funnel_node` | Deterministic Funnel | **no LLM** | `$match` pre-filter on `suppliers`, then `$rankFusion` + native `$rerank` over `supplier_documents`, deduped to the top ~5 distinct suppliers. |
| `reflect_critique_node` | Reflect & Critique | 2 calls/candidate | Per candidate: a Generate LLM call (cited claims grounded only in that supplier's chunks) and an Audit LLM call (verifies each citation, deterministic expiry guard), plus precedent lookups. |
| `rank_assembly_node` | Close | **no LLM** | `$geoNear` proximity to an assumed distribution center, then a deterministic ranking rule that stamps a 1-indexed `rank`. |
| `summarize_node` | Close | 1 call/candidate | One LLM call per candidate writes a plain-text `rationale` and selects glossary terms. |
| `persist_node` | Close | **no LLM** | `insert_one` into `supplier_alternatives`, emits `shortlist_ready`. |

So the LLM appears in three of the six nodes; `funnel_node`, `rank_assembly_node`,
and `persist_node` are deterministic. (Note: the Close layer as a whole is *not*
fully deterministic, because `summarize_node` is part of it — see ADR-006.)

All single-shot LLM calls parse output with `core.json_utils._extract_json`
(regex + `json.loads`, tolerating ```json fences); every parse failure has a
deterministic fallback so the stream never crashes.

---

## Collections it touches

| Op | Collection | Node | Filter / capability |
|----|-----------|------|--------------------|
| READ | `supplier_risk_evaluations` | plan_node | `{evaluation_id: evaluation_id_ref}` |
| READ | `risk_catalog` | plan_node | `{risk_id: {$in}}` |
| READ | `purchase_orders` | plan_node | `{supplier_id, status:"active"}` |
| READ | `suppliers` | funnel_node | `$match` pool (active, capacity ≤ 0.90, category `$in`, region `$nin`, `supplier_id $ne` disrupted) |
| READ | `supplier_documents` | funnel_node | `$rankFusion` (`$vectorSearch` + `$search`) then native `$rerank` |
| READ | `agent_memory` | reflect_critique_node | exact `find` + cross-supplier `$vectorSearch` (see below) |
| READ | `supplier_documents` | reflect_critique_node | per-supplier `find` for grounding + one bounded gap lookup |
| READ | `suppliers` | rank_assembly_node | `$geoNear` |
| **WRITE** | `supplier_alternatives` | persist_node | `insert_one` |

### MongoDB capabilities (all real, in-pipeline)

- **`$rankFusion`** over `supplier_documents` — fuses a vector arm
  (`$vectorSearch` on `supplier_documents_vector_index`, autoembed, filtered to
  the pool + `doc_type_hint`) with a full-text arm (`$search` on `chunk_text`),
  weights `{vector: 0.7, text: 0.3}`.
- **Native `$rerank`** (Voyage `rerank-2.5`) chained after `$rankFusion` — the
  candidate-narrowing never leaves Atlas. `$rerank` runs natively in-pipeline
  here; no external Voyage API call is made at runtime (see
  [ADR-007](../../docs/adr/007-backend-native_reranking.md)).
- **`$vectorSearch`** over `agent_memory` (`agent_memory_autoembed_index`,
  autoembed, filtered by `risk_type`) for semantic precedent; wrapped in
  try/except so an index/feature problem degrades to "no precedent" rather than
  failing the run.
- **`$geoNear`** over `suppliers` — real spherical distance from each candidate
  to the assumed distribution-center reference point (LA, flagged
  `assumed: true`); candidates with no `location` report `proximity_km: null`.

**`agent_memory` is read only — this module never writes to it.**

### Two separate precedent signals (never fused)

`reflect_critique_node` looks up precedent two ways and keeps them as **separate
objects** (see ADR-008):

1. **Exact track record** — a plain `find` on
   `episode.resolution.alt_supplier_id $in <candidates>` (collection scan; no
   index on that path).
2. **Semantic precedent** — the cross-supplier `$vectorSearch` by `risk_type`.

> ⚠️ **The exact track-record lookup structurally returns nothing today.** No
> code anywhere in the repo writes an `agent_memory` document with an
> `episode.resolution.alt_supplier_id` field — there is no closure/outcome
> writer (see ADR-009), and `agent_memory` is populated only by hand-curated
> seed data. Unless such episodes are seeded, `exact_track_record.found` is
> always `false`. The semantic-precedent path is the only precedent signal most
> runs will surface.

### Shape of the written document (`supplier_alternatives`)

`persist_node` inserts a hand-built dict (no Pydantic model) with:
`evaluation_id_ref`, `session_id`, `blocked_supplier_id`, `is_base: false`,
`is_demo_trigger: false`, `status: "pending_approval"`, `risk_types`,
`reference_point` (the assumed DC), `candidates_evaluated`,
`candidates_discarded: 0`, `candidates` (the ranked shortlist — each entry
carries `proximity_km`, `evidence_coverage`, `precedent_summary`, `criteria`,
`rank`, `rationale`, `glossary`), `discarded_candidates: []`,
**`approved_supplier_id: null` (always — human approval only)**,
`decision_deadline: null`, `created_at`. Always `insert_one`, never upsert.

---

## Invocation contract

- **Endpoint:** `POST /api/alternative-finder/find` (mounted in `main.py`).
- **Header:** `X-Session-ID` required → **HTTP 400** if missing/empty.
- **Request body (`FindAlternativesRequest`):** `{"evaluation_id_ref": "<id>"}`
  — a single required field. `supplier_id` and `risk_types` are **not** in the
  request; they are read server-side in `plan_node`. If `evaluation_id_ref`
  doesn't resolve to a `supplier_risk_evaluations` doc, `plan_node` emits an
  `error` (recoverable: false) and the stream ends `failed`.
- **Response:** an SSE stream (`EventSourceResponse`).

### SSE events actually emitted

Each frame is `data: <json>` with a common envelope keyed on an **`event`**
field (`{event, layer, timestamp, session_id, ...}`):

`alternative_finder_started`, `layer_started`, `layer_completed`,
`atlas_operation`, `agent_thought`, `candidate_generated`, `tool_start` /
`tool_end` (only around the bounded gap lookup), `candidate_audited`,
`shortlist_ready` (terminal result: `supplier_alternatives_id`,
`approved_supplier_id: null`, `candidates`), `error`, and `stream_end`
(`status: "completed" | "failed"`). A `None` sentinel follows `stream_end` to
close the router loop.

```bash
curl -N -X POST http://localhost:8000/api/alternative-finder/find \
  -H "X-Session-ID: demo-session-123" \
  -H "Content-Type: application/json" \
  -d '{"evaluation_id_ref": "EVAL-demo-ses-ABC123-1720000000"}'
```

---

## Internal state notes

State is a `TypedDict` (`AlternativeFinderState`), type hints only. No
checkpointer — the run lives in memory for the request. Two accumulator slots
are effectively unused: `atlas_operations` is seeded but never written (atlas
ops go straight to the SSE queue via `_emit`), and `proximity_km` is written but
consumed via the shortlist entries rather than re-read from state.

---

## Cross-module dependencies

- Reads the `supplier_risk_evaluations` document that `risk_evaluator` wrote,
  by `evaluation_id`. This is the only inbound dependency.
- Also reads shared `risk_catalog`, `purchase_orders`, `suppliers`,
  `supplier_documents`, and `agent_memory`.
- Does not import either other module.
