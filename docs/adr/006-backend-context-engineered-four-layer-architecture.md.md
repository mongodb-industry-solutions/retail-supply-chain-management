# ADR-006: Context-Engineered Four-Layer Architecture for `alternative_finder`

**Status:** Accepted

## Context

`alternative_finder` audits and justifies replacing a supplier under risk. Its output — cited evidence a manager can approve directly, triggering a real action — means evidence quality, not raw LLM capability, is what matters most. That's the design principle behind every layer.

Every extra token in context degrades a model's ability to attend to what matters (Anthropic calls this *context rot* — [*Effective context engineering for AI agents*](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), Sept 2025), and retrieval alone doesn't verify a citation is true. Certificates and contracts are static content, so this design retrieves upfront for speed and reserves agentic exploration for the one place it earns its cost: closing a specific evidence gap during audit.

## Decision

Four layers, implemented as six sequential LangGraph nodes:

```
plan_node → funnel_node → reflect_critique_node → rank_assembly_node → summarize_node → persist_node
```

- **Layer 0 — Plan** (`plan_node`): one Mongo read + one LLM call → search parameters (region exclusions, doc-type priority). No document chunks yet — the LLM works over a handful of structured fields.
- **Layer 1 — Deterministic funnel** (`funnel_node`): no LLM. `$match` pre-filter → `$rankFusion` (`$vectorSearch` + `$search`) → native Voyage `$rerank`, all inside one Atlas aggregation pipeline. This is where the biggest token reduction happens (e.g. 146 chunks → 50 → 5) — done entirely by the database.
- **Layer 2 — Reflect & Critique** (`reflect_critique_node`): Generate and Audit run as separate LLM calls (see ADR-008 for why). Audit combines deterministic checks (does the cited `chunk_id` exist? is it still valid?), an exact `agent_memory` lookup on this candidate's own track record, a cross-supplier semantic precedent search, and LLM judgment on whether the cited text actually supports the claim. Precedents are scored on age and specificity — never treated as automatic confirmation.
- **Layer 3 — Close**, three nodes: `rank_assembly_node` (no LLM — `$geoNear` proximity + rank), `summarize_node` (**one LLM call per candidate**, writes the rationale), `persist_node` (no LLM — writes the shortlist to `supplier_alternatives` with `approved_supplier_id: null`, pending human approval).

Every node emits real SSE events (`layer_started`, `atlas_operation`, `agent_thought`, `candidate_generated`, `shortlist_ready`...), so the frontend shows exactly which MongoDB operation is running, not a generic spinner.

## Why MongoDB

Fragmenting operational data, vector search, and reranking across separate systems is a top reason enterprise AI projects stall before production (MongoDB, June 2026). This design avoids that entirely: `$rankFusion` is GA, embeddings stay current via Automated Embedding with nothing leaving Atlas, and native Voyage reranking runs in the same pipeline. One copy of the data means one security model — the same access control, encryption (at rest, in transit, in use), and auditing covers both a document and its vector index.

## Consequences

- LLM calls appear only in `plan_node`, `reflect_critique_node`, and `summarize_node`. Layer 1 is fully deterministic and verifiably so — it emits no `agent_thought` events.
- Audit effort concentrates at Layer 2, where a bad citation reaching human approval carries real cost — unlike an intermediate mistake among 50 candidates, which the next stage simply filters out.
- Every field name and index assumption here was verified against live Atlas data, not assumed from a design document — see `alternative_finder/README.md`, "Verified in Stage 4.X" sections, for the full list.

## Alternatives Considered

- **Single LLM call over the full retrieved context.** Rejected — reintroduces the cost/precision tradeoff this design exists to avoid.
- **LLM-orchestrated retrieval for Layer 1** (ReAct-style, letting the LLM decide every Mongo operation). Rejected — the 146→5 reduction is meant to showcase MongoDB's native hybrid-search and reranking, not the LLM's tool-use skill.
- **Single monolithic node** for all four layers. Rejected — collapses the SSE layer-by-layer visibility, which is central to what this demo shows: which parts are deterministic database operations and which are LLM reasoning.
