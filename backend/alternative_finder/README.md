# alternative_finder — SSE Event Contract & Output Schema (draft for integration)

**Status: design contract, not yet implemented.** This README describes the
target SSE event contract and output schema for Stage 4.0 onward. Until the
graph is built and verified against real behavior, treat this as intention,
not as documentation of running code — update this same file once each
stage lands, replacing "target" language with verified behavior, 

**Event vocabulary reused from `risk_evaluator`** (for visual/UX consistency in the frontend "agent thinking" panel): `tool_start`, `tool_end`, `atlas_operation`, `agent_thought`, `agent_response`, `error`. Extended below with layer-aware fields and new event types specific to the 4-layer design. Unlike `risk_evaluator`'s real contract, this one explicitly defines a terminal event (`stream_end`) instead of relying on an undocumented `None` sentinel.

---

## Entry contract (request)

```json
POST /api/alternative-finder/find
Headers: X-Session-ID: <session_id>   // required, 400 if missing

{
  "evaluation_id_ref": "string"
}
```

No other parameters are requested from the manager. `session_id` comes from the header, consistent with the rest of the system. Everything else (`supplier_id`, `risk_scores`, `operational_context`) is read server-side from the referenced `supplier_risk_evaluations` document.

---

## Common event envelope

Every SSE event shares this envelope; event-specific fields are added on top.

```json
{
  "event": "<event_type>",
  "layer": 0,
  "timestamp": "2026-07-07T14:32:10.123Z",
  "session_id": "string"
}
```

`layer` is one of `0` (Plan), `1` (Funnel), `2` (Reflect & Critique), `3` (Close). Omitted or `null` for events that aren't layer-specific (e.g. `alternative_finder_started`, `stream_end`, `error`).

---

## Event types

### 1. `alternative_finder_started`
Emitted once, immediately after the request is accepted.
```json
{
  "event": "alternative_finder_started",
  "timestamp": "...",
  "session_id": "...",
  "evaluation_id_ref": "...",
  "supplier_id": "SUP-SHENZHEN-441",
  "risk_types": ["geopolitical_tariff", "logistics_disruption"]
}
```

### 2. `layer_started` / `layer_completed`
Marks entry/exit of each of the 4 layers — drives the frontend's step indicator / agent mascot state.
```json
{ "event": "layer_started", "layer": 1, "timestamp": "...", "session_id": "...",
  "label": "Deterministic funnel: narrowing candidates" }

{ "event": "layer_completed", "layer": 1, "timestamp": "...", "session_id": "...",
  "summary": "5 candidates selected from 146 document chunks" }
```

### 3. `atlas_operation`
**The centerpiece event** — every real MongoDB operation this agent runs, shown explicitly, per layer. This is the first real use of the `AtlasOperation` schema (found defined but never instantiated in the prior audit).

```json
{
  "event": "atlas_operation",
  "layer": 1,
  "timestamp": "...",
  "session_id": "...",
  "operation_type": "$rankFusion",
  "collection": "supplier_documents",
  "description": "Combining semantic and full-text search across 146 document chunks",
  "metrics": { "candidates_in": 146, "candidates_out": 50 }
}
```

Known operations to emit (see mapping table already agreed):

| Layer | operation_type | collection | description |
|---|---|---|---|
| 0 | `find` | `supplier_risk_evaluations` | Reading the real risk evaluation |
| 0 | `find` | `purchase_orders` | Checking active orders for time pressure |
| 1 | `$match` | `suppliers` | Filtering by category, excluded region, capacity margin |
| 1 | `$rankFusion` (`$vectorSearch` + `$search`) | `supplier_documents` | Combining semantic and full-text search |
| 1 | `$rerank` (native Voyage) | `supplier_documents` | Native reranking, no external call, narrowing to top candidates |
| 2 | `find` (exact) | `agent_memory` | Checking if this candidate was proposed before (`episode.resolution.alt_supplier_id`) |
| 2 | `$vectorSearch` | `agent_memory` | Cross-supplier semantic precedent search by `risk_type` |
| 2 | `find` (targeted) | `supplier_documents` | Resolving a specific evidence gap |
| 3 | `$geoNear` | `suppliers` | Calculating real proximity to distribution center |
| 3 | `insertOne` / `updateOne` | `supplier_alternatives` | Persisting shortlist, pending approval |

`metrics` is optional but should be included whenever there's a meaningful before/after count (Layer 1 operations especially — that reduction is the whole point of the demo).

### 4. `agent_thought`
LLM reasoning, only present for the two layers where an LLM actually runs (0 and 2). Includes a `step` field to distinguish sub-stages.

```json
{
  "event": "agent_thought",
  "layer": 0,
  "timestamp": "...",
  "session_id": "...",
  "step": "plan_synthesis",
  "text": "Excluding CN and TW due to active tariff and logistics risk. Prioritizing certification and contract evidence given the compliance nature of the risk, with a secondary profile for lead time given the promotional deadline."
}
```

Layer 2 has two distinct `step` values, since Generate and Audit are separate LLM calls and must never share a thought stream:
- `step: "generate"` — per-candidate reasoning while drafting cited claims.
- `step: "audit"` — per-candidate reasoning while verifying those claims (deterministic checks, precedent checks, and LLM judgment on evidence sufficiency).

### 5. `tool_start` / `tool_end`
Reserved for the bounded gap-resolution loop in Layer 2 (targeted query when critical evidence is missing, capped at a fixed number of iterations) — mirrors the ReAct tool pattern already used in `risk_evaluator`.

```json
{ "event": "tool_start", "layer": 2, "timestamp": "...", "session_id": "...",
  "tool": "search_supplier_documents", "args": { "supplier_id": "SUP-MONTERREY-MX", "doc_type": "email" } }

{ "event": "tool_end", "layer": 2, "timestamp": "...", "session_id": "...",
  "tool": "search_supplier_documents", "result_summary": "1 email found, referencing current capacity" }
```

### 6. `candidate_generated`
Emitted once per candidate after the Generate call, before Audit — allows the frontend to progressively render candidate cards instead of waiting for the full pipeline.

```json
{
  "event": "candidate_generated",
  "layer": 2,
  "timestamp": "...",
  "session_id": "...",
  "supplier_id": "SUP-MONTERREY-MX",
  "supplier_name": "Envases Norteños S.A.",
  "location": "Monterrey, Mexico",
  "category": "packaging_materials"
}
```

### 7. `candidate_audited`
Emitted once per candidate after the Audit call — carries the verdict that becomes part of the final shortlist entry (see output schema below). This is the event the "Compliant with ISO 9001" card in the mockup renders from.

```json
{
  "event": "candidate_audited",
  "layer": 2,
  "timestamp": "...",
  "session_id": "...",
  "supplier_id": "SUP-MONTERREY-MX",
  "criteria": [
    {
      "criterion": "compliance_certification",
      "status": "compliant",
      "citation": {
        "chunk_id": "cert_001",
        "doc_type": "pdf",
        "source_file": "ISO_9001_Certificate_2024.pdf",
        "page": 3,
        "excerpt": "...certifies that Tijuana Tech Assembly S.A. de C.V. has implemented and maintains a Quality Management System in accordance with ISO 9001:2015 for component assembly and distribution...",
        "valid_until": "2027-05-31"
      }
    },
    {
      "criterion": "operational_status",
      "status": "unknown",
      "citation": null,
      "note": "No recent operational document found for this candidate"
    }
  ],
  "precedent": {
    "exact_track_record": { "found": false, "note": "No prior proposal for this candidate" },
    "semantic_precedent": {
      "found": true,
      "memory_id": "MEM-20260218-TW-E",
      "risk_type": "geopolitical_tariff",
      "recorded_at": "2026-02-18",
      "strength": "weak",
      "reason": "Same risk_type but different product category — directional only, not confirmation"
    }
  },
  "evidence_coverage": { "criteria_total": 3, "criteria_verified": 2 }
}
```

Note: `precedent` deliberately keeps the two memory mechanisms (exact track record vs. semantic cross-supplier precedent) as separate objects — never merged into one score, per design.

### 8. `shortlist_ready` (terminal result event)
Final output, after `$geoNear` in Layer 3. This is the payload the "Recommended Alternative Suppliers" screen renders in full.

```json
{
  "event": "shortlist_ready",
  "layer": 3,
  "timestamp": "...",
  "session_id": "...",
  "evaluation_id_ref": "...",
  "supplier_alternatives_id": "string",
  "approved_supplier_id": null,
  "candidates": [
    {
      "supplier_id": "SUP-MONTERREY-MX",
      "supplier_name": "Envases Norteños S.A.",
      "location": "Monterrey, Mexico",
      "category": "packaging_materials",
      "proximity_km": 412.3,
      "evidence_coverage": { "criteria_total": 3, "criteria_verified": 2 },
      "precedent_summary": "weak_directional",
      "criteria": [ "...same shape as candidate_audited.criteria..." ]
    }
  ]
}
```

**Explicit note on removed/replaced fields** (see mapping agreed in design session): this schema does NOT include `reliability_score`, `lead_time_days`, `capacity_pct`, or `price_delta_pct` — those existed only in the pre-`data_models_v4.html`-era mockup and have no backing field in `suppliers` or `purchase_orders` today. They are replaced by, respectively: `precedent_summary` (real memory-derived signal), `proximity_km` (real `$geoNear`), and `evidence_coverage` (real audit verdict count). No price substitute exists yet — flagged as an open data gap for a future enrichment pass, not fabricated.

### 9. `error`
```json
{ "event": "error", "layer": 2, "timestamp": "...", "session_id": "...",
  "message": "string", "recoverable": false }
```

### 10. `stream_end`
Explicit terminal event — replaces the undocumented `None` sentinel found in `risk_evaluator`'s real contract during the prior audit. Always emitted last, whether the run succeeded or errored.
```json
{ "event": "stream_end", "timestamp": "...", "session_id": "...", "status": "completed" }
```
`status` is `"completed"` or `"failed"`.

---

## Open items for Claude Code to verify while implementing

- Confirm `$rerank` stage availability and cluster version support (Layer 1) — expected to work given current cluster tier, but confirm live rather than assuming.
- Confirm whether `$vectorSearch` filter supports `$in` over a `supplier_id` list (needed for the pre-filtered candidate set feeding Layer 1).
- Confirm whether an index exists on `episode.resolution.alt_supplier_id` in `agent_memory`, or whether one needs to be created to avoid a collection scan on the Layer 2 exact-match query.
- `metrics.candidates_in/out` on `atlas_operation` events should reflect real counts from the live aggregation, never estimated.
