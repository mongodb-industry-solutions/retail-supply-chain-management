# ADR-006: Four-Layer Architecture for `alternative_finder`


**Status:** Accepted (2026-07-07)

## Context

`alternative_finder` originally had a design based on `data_models_v4.html`
(the pre-rebuild product idea): `Hybrid Search → Rerank → Reflect & Critique
→ $geoNear → shortlist`. A code audit (2026-07-03) confirmed the module was
a pure stub against this design — no working router, no real graph, no-op
nodes, a `rerank.py` with a docstring describing behavior it didn't
implement.

A design session (2026-07-06) replaced this with a new architecture, closed
independently of the old data model, then implemented and verified against
live Atlas infrastructure in five stages (2026-07-07).

## Decision

`alternative_finder` is built as a `LangGraph` `StateGraph` organised around
four conceptual layers. **In code today these four layers are implemented
across six sequential nodes** — the Close layer is split into three nodes
(`rank_assembly_node`, `summarize_node`, `persist_node`). The full node
sequence is:

```
plan_node → funnel_node → reflect_critique_node → rank_assembly_node → summarize_node → persist_node
```

The four layers map onto those nodes as follows:

1. **Plan** — one real Mongo read of the triggering
   `supplier_risk_evaluations` document (plus `risk_catalog` for risk-type
   resolution and `purchase_orders` for time-pressure signals), followed by
   a single LLM call (no tools, no ReAct loop) that produces a search plan:
   `region_exclude`, `doc_type_hint`, `profile_text`.
2. **Deterministic Funnel** — no LLM call. A `$match` pre-filter on
   `suppliers`, then `$rankFusion` (`$vectorSearch` + `$search`) over
   `supplier_documents`, then a native Voyage `$rerank` stage, narrowing a
   pool of dozens of suppliers down to 5 candidates entirely inside the
   database.
3. **Reflect & Critique** (`reflect_critique_node`) — two separate LLM calls
   per candidate (Generate, then Audit — see ADR-008 on precedent signals for
   why these and the two memory mechanisms are never fused), grounded in real
   `supplier_documents` chunks and real `agent_memory` precedent.
4. **Close** — implemented as three nodes, **not fully deterministic** as
   originally scoped:
   - `rank_assembly_node` — no LLM. Real `$geoNear` proximity to an (assumed)
     distribution-center reference point, then a deterministic ranking rule
     that stamps a 1-indexed `rank` on each candidate.
   - `summarize_node` — **one LLM call per candidate** that writes a
     plain-text `rationale` (and selects glossary terms). This is the one
     place the Close layer invokes the LLM.
   - `persist_node` — no LLM. A single `insertOne` into
     `supplier_alternatives` with `approved_supplier_id` always `null`
     (human-approval gate), emitting the terminal `shortlist_ready` event.

Each node emits real events over a documented SSE contract
(`alternative_finder_started`, `layer_started`/`layer_completed`,
`atlas_operation`, `agent_thought`, `tool_start`/`tool_end`,
`candidate_generated`/`candidate_audited`, `shortlist_ready`, `error`,
`stream_end`) so the frontend can render exactly what MongoDB operation is
running at each moment, not just a generic "thinking" spinner.

## Consequences

- LLM calls appear in three of the six nodes: `plan_node` (one call),
  `reflect_critique_node` (two per candidate), and `summarize_node` (one per
  candidate). The **Funnel layer is fully deterministic** — no LLM, and it
  emits no `agent_thought` event, which is a verifiable property of the
  running system. Note the Close layer is *not* uniformly deterministic:
  `rank_assembly_node` and `persist_node` are, but `summarize_node` makes an
  LLM call. (An earlier version of this ADR described Close as fully
  deterministic; that no longer holds since Close was split to add the
  per-candidate rationale.)
- The "146 documents → 50 → 5" (or whatever the live counts are for a given
  run) reduction in the Funnel layer is the centerpiece demo moment: it
  happens entirely via MongoDB aggregation stages (`$rankFusion`, native
  `$rerank`), with real before/after counts surfaced to the frontend — not
  something an LLM prompt claims to have done.
- Because the module was rebuilt from a 100%-stub state, there was no
  legacy behavior to preserve; the old `Candidate` / `AlternativeFinderState`
  / `AlternativeFinderResult` schemas and the `hybrid_search → voyage_rerank
  → validate_certifications/lead_time/capacity` node names were removed
  entirely rather than migrated.
- Every field name and index assumption in this architecture was confirmed
  against live data before being coded, not assumed from a design
  document — several diverged from the original design doc's expectations
  (e.g. `risk_scores[].risk_id` are catalog codes, not human-readable
  `risk_type` strings; `supplier_documents` citation fields have different
  real names than the contract's output keys). See
  `alternative_finder/README.md`'s "Verified in Stage 4.X" sections for the
  full list.

## Alternatives Considered

- **Single monolithic LangGraph node** doing all four layers' work in one
  function. Rejected: it would collapse the SSE contract's layer-by-layer
  visibility, which is a core part of what this demo is meant to show
  (i.e., which parts are deterministic database operations vs. LLM
  reasoning).
- **LLM-orchestrated retrieval** (letting an LLM decide which Mongo
  operations to run in Layer 1, ReAct-style). Rejected for the Funnel
  layer specifically: the reduction from a large candidate pool to 5 is
  meant to demonstrate MongoDB's native hybrid-search and reranking
  capability, not an LLM's tool-use skill.
