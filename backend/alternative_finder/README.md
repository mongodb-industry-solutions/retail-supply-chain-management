# alternative_finder — SSE Event Contract & Output Schema (draft for integration)

**Status:** design contract, not yet implemented in code. Confirmed against real code audit (2026-07-07): current module is a stub, no existing SSE contract to preserve — this is a fresh definition, not a migration.

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
Emitted once, immediately after the request is accepted — before any Mongo read
happens. Carries only what is known at request time. `supplier_id` and
`risk_types` are **not** included here: they only exist after Layer 0 reads
the referenced `supplier_risk_evaluations` document, so promising them
"immediately" was a contradiction caught during Stage 4.0 implementation.
They now surface for the first time in Layer 0's `atlas_operation` /
`layer_completed` events (see below).
```json
{
  "event": "alternative_finder_started",
  "timestamp": "...",
  "session_id": "...",
  "evaluation_id_ref": "..."
}
```

### 2. `layer_started` / `layer_completed`
Marks entry/exit of each of the 4 layers — drives the frontend's step indicator / agent mascot state. **Layer 0's `layer_completed` is where `supplier_id` and `risk_types` surface for the first time**, once actually read from `supplier_risk_evaluations` — not in `alternative_finder_started` (see above).
```json
{ "event": "layer_started", "layer": 1, "timestamp": "...", "session_id": "...",
  "label": "Deterministic funnel: narrowing candidates" }

{ "event": "layer_completed", "layer": 0, "timestamp": "...", "session_id": "...",
  "supplier_id": "SUP-SHENZHEN-441",
  "risk_types": ["geopolitical_tariff", "logistics_disruption"],
  "summary": "Plan synthesised: 1 region excluded, profile ready" }

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
| 0 | `find` | `risk_catalog` | Resolving risk types and affected regions for the evaluated risks |
| 1 | `$match` | `suppliers` | Filtering by category, excluded region, capacity margin |
| 1 | `$rankFusion` (`$vectorSearch` + `$search`) | `supplier_documents` | Combining semantic and full-text search |
| 1 | `$rerank` (native Voyage) | `supplier_documents` | Native reranking, no external call, narrowing to top candidates |
| 2 | `find` (exact) | `agent_memory` | Checking if this candidate was proposed before (`episode.resolution.alt_supplier_id`) |
| 2 | `$vectorSearch` | `agent_memory` | Cross-supplier semantic precedent search by `risk_type` |
| 3 | `$geoNear` | `suppliers` | Calculating real proximity to distribution center |
| 3 | `insertOne` / `updateOne` | `supplier_alternatives` | Persisting shortlist, pending approval |

The bounded gap-resolution lookup in Layer 2 (targeted `find` on `supplier_documents`, see `tool_start` / `tool_end` below) intentionally does **not** emit its own `atlas_operation` — it surfaces only as `tool_start` / `tool_end`, consistent with the ReAct tool framing. Confirmed in a live end-to-end run: the gap lookup produced `tool_start` / `tool_end` with no accompanying `atlas_operation`.

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

Each criterion's `status` is one of three real allowed values: **`compliant` / `noncompliant` / `unknown`**. `noncompliant` fires when a citation directly contradicts a claim, or when a cited certificate's `valid_until` has already passed (a deterministic expiry check, not an LLM judgment). `unknown` is used when no supporting document is found at all (`citation: null`).

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
    },
    {
      "criterion": "sustainability_practices",
      "status": "noncompliant",
      "citation": {
        "chunk_id": "sustain_017",
        "doc_type": "sustainability_report",
        "source_file": "Sustainability_Audit_2022.pdf",
        "page": 1,
        "excerpt": "...environmental compliance certification valid through 2024-06-30...",
        "valid_until": "2024-06-30"
      },
      "note": "Cited certificate's valid_until (2024-06-30) is in the past — deterministic expiry check failed"
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

Note: the third (`sustainability_practices` / `noncompliant`) criterion above is an illustrative shape example — not captured from an actual test run; modeled on the deterministic-expiry behavior described above.

Note: `precedent` deliberately keeps the two memory mechanisms (exact track record vs. semantic cross-supplier precedent) as separate objects — never merged into one score, per design.

Note: `exact_track_record` is looked up **per candidate** (keyed on `episode.resolution.alt_supplier_id`), but `semantic_precedent` is computed **once per run** (a single cross-supplier `$vectorSearch` by `risk_type`) and attached **identically to every candidate**. So all candidates in a run carry the same `semantic_precedent` object — same `memory_id`, same `score`. This is expected (the semantic hit is a run-level, risk-type-level signal, not a per-candidate one), not a bug. Confirmed in a live end-to-end run where all 5 candidates shared an identical `semantic_precedent`.

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

## Verified in Stage 4.0 (plumbing) — real behavior, not just design intent

- **`X-Session-ID` validation is 422, not 400, when the header is entirely absent.** Only a *present-but-empty* header returns 400. This matches `risk_evaluator`'s shared `core/session.py::get_session_id` dependency exactly — confirmed by running both paths. The earlier "400 if missing" wording in this doc and in `decisiones-diseno-sesion` (§7) didn't distinguish "absent" from "empty"; this is the corrected, verified statement.
- Transport is `EventSourceResponse` (sse_starlette), matching `risk_evaluator`'s actual router — not `StreamingResponse`.
- The full 30-event sequence for a placeholder run (Stage 4.0) was tested green end-to-end: `alternative_finder_started` → layer 0 (2× `atlas_operation`, 1× `agent_thought`, `layer_completed` with `supplier_id`/`risk_types`) → layer 1 (3× `atlas_operation`, no thoughts, `layer_completed`) → layer 2 (per-candidate `agent_thought`+`candidate_generated`, 3× `atlas_operation`, per-candidate `agent_thought`+`candidate_audited`, `layer_completed`) → layer 3 (2× `atlas_operation`, `shortlist_ready`, `layer_completed`) → `stream_end`.
- Internally, a `None` sentinel is still placed on the SSE queue *after* `stream_end` purely to break the server's read loop — this is plumbing, not part of the wire contract; the client only ever sees `stream_end` as the last frame.
- No Mongo reads/writes, LLM calls, or `$rankFusion`/`$rerank`/`$vectorSearch`/`$geoNear` exist yet — all `atlas_operation` events carry placeholder `metrics` with real `operation_type`/`collection`/`description` strings. This is Stage 4.1+ work.

## Verified in Stage 4.1 (Layer 0 / Plan made real)

- **`supplier_risk_evaluations` is keyed by `evaluation_id`** (not `evaluation_id_ref`); the request's `evaluation_id_ref` is matched against that field. If it doesn't resolve, plan_node emits `error` (recoverable: false) and the stream ends `failed` — no placeholder fall-through.
- **`risk_scores[].risk_id` are catalog codes** (`RISK-LOG-001`, `RISK-GEO-001`, `RISK-CLM-001`), **not** the human `risk_type` strings this doc's earlier example assumed. The `risk_type` (`logistics_disruption` / `geopolitical_tariff` / `climate_disruption`) and `applies_to_regions` come from `risk_catalog`. This required a **third Layer 0 `atlas_operation` (`find` on `risk_catalog`)** beyond the two in the mapping table — added deliberately, not silently.
- **`purchase_orders` "active" is a literal `status` value** (statuses in use: `active` / `in_transit` / `pending`). Time-pressure signals distilled from real orders: `days_until_due`, `value_usd`, `promotional_window`. `documents_read` metric is the real count (0 if none).
- **`doc_type_hint` is constrained to the real `supplier_documents` `doc_type` vocabulary**: `audit_report`, `certificate`, `contract`, `email`, `sustainability_report`. Values outside this set are dropped.
- **One structured LLM call, no tools/ReAct** — matches risk_evaluator's client construction (`ChatAnthropic` + proxy `base_url` + `api-key` header) and its JSON-in-prompt + parse approach (no `with_structured_output` pattern exists anywhere in the codebase).
- `alternative_finder_started` no longer carries `supplier_id`/`risk_types`; they surface only on Layer 0's `layer_completed`, read from the real evaluation.
- Layers 1–3 unchanged (still Stage 4.0 placeholder), now consuming plan_node's real `region_exclude`/`doc_type_hint`/`profile_text`.
- `region_exclude` decision: LLM judgment is intentionally NOT bounded to `risk_catalog`'s `applies_to_regions` — it may broaden (e.g. adding HK alongside CN) based on sourcing intent. Confirmed as the desired behavior, not an open flag.

## Verified in Stage 4.2 (Layer 1 / Deterministic Funnel made real)

All three Layer 1 Atlas operations now run against the live cluster with real before/after counts. Layer 1 emits **no `agent_thought`** events (deterministic by design — confirmed still true, no LLM call added). Layers 0, 2, 3 unchanged.

- **`$rankFusion` (`$vectorSearch` + `$search`) works on this cluster.** First real exercise of the capability by this codebase. Vector arm: autoEmbed voyage-4 on `auto_embed_text` (`supplier_documents_vector_index`); text arm: `$search` on `chunk_text` (`supplier_documents_fulltext_index`). Combined with `combination.weights {vector: 0.7, text: 0.3}` — semantic profile match weighted over lexical, a judgment call (no doc specifies weights).
- **`$vectorSearch` `filter` DOES support `$in` over a `supplier_id` list** — confirmed live. This is how Layer 1's semantic search is restricted to the `$match` pool. The **text arm cannot** be pre-filtered the same way (the full-text index maps only `chunk_text`, `dynamic:false`), so the pool restriction is re-applied as a `$match` stage inside the text sub-pipeline.
- **`doc_type_hint` is applied as a filter on the vector arm only.** The vector index supports a `doc_type` filter; the full-text index does not (only `chunk_text` is mapped). Applying it on the arm that natively supports it, rather than adding a post-filter that could shrink the pool below target — flagged, not silent.
- **Native Voyage `$rerank` works — but ONLY after an Atlas project-level config change made during this stage.** Initially it failed at execution (not spec-parse) with `403 "$rerank is not enabled for JeffN. Enable the $rerank Project Setting to run this pipeline." and VOYAGE_API_KEY environment variable not set`. This was a real blocker, reported as a decision point. Resolved by: (a) enabling the **Native Reranking** project setting, and (b) creating a project-level **Voyage Model API key** in Atlas. After that the stage runs. Correct spec: `{$rerank: {query: {text: <profile_text>}, path: "chunk_text", model: "rerank-2.5", numDocsToRerank: <n>}}`; relevance score is read via `{$meta: "score"}` (not `relevanceScore`/`rerankScore`).
- **Candidates are suppliers, not chunks.** Search operates over `supplier_documents` chunks; reranked chunks are deduped to the top 5 **distinct** `supplier_id`s (preserving rerank order), then hydrated from the `suppliers` docs already fetched by `$match`. `candidates_out` on `$rerank` is the distinct-supplier count (target 5), `candidates_in` is the fused chunk count.
- **`$match` fields (confirmed against live `suppliers`, not any prior design doc):** `status` (`"active"`), `product_categories` (array → `$in` the disrupted supplier's categories), `region` (ISO code → `$nin region_exclude`), `committed_capacity_pct` (fraction already committed → `$lte 0.90`, i.e. ≥10% headroom — **judgment call**, no doc specifies a threshold; real values run ~0.30-0.70 so it is permissive). The disrupted supplier is excluded via `supplier_id $ne`.
- **`atlas_operation` "in" counts are real, per-run.** `$match` in = total active suppliers (40); `$rankFusion` in = live count of eligible chunks for the pool (e.g. 24 or 15, **not** a static 146 — the corpus is pre-filtered). Verified end-to-end on two evaluations: SUP-SHENZHEN-441 packaging (40→17→5, exclude CN/HK) and SUP-VALLE-MX fresh_produce (40→11→5, exclude MX); both produced plausible in-category, out-of-excluded-region candidates.
- **Empty-pool path:** if `$match` yields no suppliers, `$rankFusion`/`$rerank` are emitted with zero counts (event sequence preserved) and an empty candidate set is handed downstream — no search is attempted against an empty `$in` list.

## Verified in Stage 4.3 (Layer 2 / Reflect & Critique made real)

Layer 2's Generate and Audit calls now run against real data, with real citations and real precedent lookups. Generate and Audit remain two separate LLM calls with separate `agent_thought` streams (`step: "generate"` / `step: "audit"`), confirmed still true. Layers 0, 1, 3 unchanged.

**The three implemented audit criteria** (the fixed set every candidate is scored against; `evidence_coverage.criteria_total` is therefore always `3`) and the real `supplier_documents` `doc_type`(s) that back each:

| `criterion` | Backing `doc_type`(s) |
|---|---|
| `compliance_certification` | `certificate`, `audit_report` |
| `operational_status` | `contract`, `email` |
| `sustainability_practices` | `sustainability_report` |

Each criterion resolves to `compliant` / `noncompliant` / `unknown` (see `candidate_audited` above); `unknown` is expected wherever the backing `doc_type` is absent for a candidate.

- **Citation field mapping (confirmed against live `supplier_documents`):** the wire `citation` object is projected from real chunk fields — `source_file` ← `filename`, `page` ← `page_ref`, `excerpt` ← `chunk_text`. The doc's earlier example keys (`source_file`/`page`/`excerpt`) are retained on the wire; only the backing field names differ. `chunk_id`, `doc_type`, and `valid_until` map through unchanged where present.
- **`agent_memory` exact-match query needs no index.** Verified: there is **no index on `episode.resolution.alt_supplier_id`**, so the Layer 2 exact-track-record `find` is a collection scan — but with only **5 episodes total** in `agent_memory`, the scan is trivially fine. **Decision: do not create an index.** This resolves the prior open question; if the collection grows by orders of magnitude this should be revisited, but it is not a current concern.

**Known data gaps (Stage 4.3) — documented, NOT routed around in code.** These are gaps in the seed data, not design flaws; the code exercises the real paths and reports honestly (`found: false` / `status: "unknown"`) rather than branching to hide them:

- **`exact_track_record` never hit in these two evals.** The exact precedent query ran correctly but returned no match for any candidate across both test evaluations — expected, given the sparse `agent_memory` seed. The code emits `exact_track_record.found: false`; it does not skip or fabricate the lookup.
- **Sparse `sustainability_report` coverage.** Few candidates have a `sustainability_report` chunk, so sustainability-related criteria frequently resolve to `status: "unknown"` with `citation: null`. This is real evidence absence surfaced faithfully, not a code defect.
- **Only 5 `agent_memory` episodes total.** The entire memory corpus is 5 episodes, which limits both exact and semantic precedent signal strength in this demo. Precedent output is therefore thin by data availability, not by logic.

## Verified in Stage 4.4 (Layer 3 / Close made real — final layer)

`close_node` now runs against the live cluster: real `$geoNear`, real `insertOne` into `supplier_alternatives`. Layer 3 emits **no `agent_thought`** (deterministic by design — confirmed still true, no LLM call added). Layers 0, 1, 2 unchanged. With this stage, `alternative_finder` goes from 100%-stub (confirmed 3-jul) to a fully real four-layer pipeline.

- **GeoJSON field is `location`** on `suppliers` — `{type: "Point", coordinates: [lng, lat]}`, backed by a `location_2dsphere` index (confirmed via `index_information()`). It is the same field `risk_evaluator`'s `$geoWithin` uses. `$geoNear` runs with `spherical: true`, `key: "location"`, restricted to the candidate `supplier_id`s via its `query`; distance returned in metres, converted to km (rounded to 0.1).
- **Distribution-center reference point is an ASSUMPTION, flagged — not confirmed.** There is **no fixed DC coordinate anywhere** in the system: no config value, no `distribution_center`/`config` collection, and `risk_evaluator` never uses one (its geospatial queries measure distance to risk *epicentres*). The seed corpus names several FreshMart DCs (Los Angeles, Chicago, Monterrey, Miami) with no coordinates. We use **FreshMart's Los Angeles DC** (`[-118.2437, 34.0522]`, the most-referenced US import hub in `supplier_documents`) as a single reference point. The `$geoNear` `atlas_operation` event carries `reference_point: {name, coordinates, assumed: true}` so the assumption is visible to the frontend, never passed off as confirmed. **Open item for a future stage:** replace with a real per-DC / multi-DC coordinate source when one exists.

  Real shape of the `$geoNear` `atlas_operation` event (from a live Stage 4.4 run):
  ```json
  {
    "event": "atlas_operation",
    "layer": 3,
    "timestamp": "...",
    "session_id": "...",
    "operation_type": "$geoNear",
    "collection": "suppliers",
    "description": "Calculating real proximity to distribution center",
    "reference_point": {
      "name": "FreshMart Los Angeles DC",
      "coordinates": [-118.2437, 34.0522],
      "assumed": true
    },
    "metrics": { "candidates_in": 5, "candidates_out": 5, "missing_location": 0 }
  }
  ```
- **Real proximity confirmed sane:** e.g. against the LA reference, `SUP-FRESNO-US` ≈ 330 km, `SUP-SEATTLE-US` ≈ 1547 km, `SUP-VN-204` ≈ 13151 km — geographically plausible. A candidate with no `location` (or otherwise not returned by `$geoNear`) gets `proximity_km: null` and is counted in the `$geoNear` event's `missing_location` metric — a real geo gap reported honestly, never back-filled and never dropped from the shortlist. (In the three test evals, all candidates had `location`, so `missing_location: 0`.)
- **`supplier_alternatives` write shape.** The ONE pre-existing document is an `is_base` baseline (`status: "no_action_required"`, empty `candidates`, `_id` an `ObjectId`). Per the design doc this collection's final shape isn't fixed; we keep the baseline's field names where they carry over (`evaluation_id_ref`, `blocked_supplier_id`, `is_base`, `is_demo_trigger`, `session_id`, `status`, `candidates_evaluated`, `candidates_discarded`, `candidates`, `discarded_candidates`, `approved_supplier_id`, `decision_deadline`, `created_at`) and **add** two Stage-4 fields the baseline lacked: `risk_types` and `reference_point`. **Deliberate divergences from the baseline** (flagged, not silent): `status → "pending_approval"`; `is_base → false`; `blocked_supplier_id →` the disrupted supplier_id (baseline left it null); `candidates` carries the full real shortlist entries. `_id` is a Mongo-generated `ObjectId` (matches the baseline's type).
- **`insertOne`, never upsert.** Each run is a new proposal document, so run history is preserved and the `is_base` baseline is never overwritten. `supplier_alternatives_id` on `shortlist_ready` is the real inserted `_id` (`str(ObjectId)`) — the collection has no separate business-level id field, so the `_id` is authoritative.
- **`approved_supplier_id` is ALWAYS `null`** — set neither in the persisted document nor in `shortlist_ready`. Approval is a human step elsewhere in the system, never performed by this agent (no approval-workflow logic exists in `alternative_finder`).
- **`precedent_summary` is a presentation-only token derived from the two precedent objects WITHOUT merging them:** `exact_track_record` (if a candidate was literally proposed before) > `<strength>_directional` (semantic hit, e.g. `weak_directional`) > `none`. The full, unmerged `exact_track_record` / `semantic_precedent` objects still ride on each candidate's `criteria` payload untouched.
- **`exact_track_record` observed firing with `found: true`.** Reproduced by running a fresh_produce evaluation whose pool is NOT MX-excluded (`SUP-BOGOTA-CO`, `EVAL-test-ses-OTA-CO-1782478955`): `SUP-VALLE-MX` surfaced as a candidate and matched `agent_memory` episode `MEM-20251203-SINALOA-MX-D` (`episode.resolution.alt_supplier_id == SUP-VALLE-MX`), yielding `exact_track_record.found: true` and `precedent_summary: "exact_track_record"`. This is the first time this path fired truthfully rather than always-false — the Stage-4.2/4.3 evals (`SUP-SHENZHEN-441`, `SUP-VALLE-MX`) never include `SUP-SINALOA-MX`/`SUP-VALLE-MX` in-pool because both are MX and MX is excluded there, so `exact_found` stayed false across all their candidates (a data-topology fact, not a code gap).
- **`shortlist_ready` still excludes `reliability_score`, `lead_time_days`, `capacity_pct`, `price_delta_pct`** — verified programmatically (none present in any run's payload).
- **Write verified by read-back.** After each run the inserted document was re-read by `_id`: candidate ids, `proximity_km`, `approved_supplier_id: null`, `status: "pending_approval"`, `is_base: false` all matched what `shortlist_ready` emitted. (The 6 verification documents written during testing were then removed; the collection is left with only the original `is_base` baseline.)

---

## Resolved open questions

- ~~Confirm `$rerank` stage availability and cluster version support (Layer 1).~~ **RESOLVED (Stage 4.2):** stage available; required enabling the Atlas Native Reranking project setting + a project-level Voyage Model API key (see above).
- ~~Confirm whether `$vectorSearch` filter supports `$in` over a `supplier_id` list.~~ **RESOLVED (Stage 4.2):** yes, supported and in use for Layer 1's pool restriction.
- ~~Confirm whether an index exists on `episode.resolution.alt_supplier_id` in `agent_memory`, or whether one needs to be created to avoid a collection scan on the Layer 2 exact-match query.~~ **RESOLVED (Stage 4.3):** no index exists; scan is fine at 5 episodes, no index created (see above).

## Standing invariants

- `metrics.candidates_in/out` on `atlas_operation` events should reflect real counts from the live aggregation, never estimated.
