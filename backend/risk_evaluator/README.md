# `risk_evaluator` — dynamic RPN scoring, weighed by historical precedent

## What we're demonstrating

Once a disruption signal exists — a tariff, a storm, a port delay — the next question is the one that actually matters to a procurement manager: who's exposed right now, how badly, and does anything that's happened before change that judgment? Answering it fast, over a whole supplier base, is exactly the kind of thing that stalls on a patchwork of legacy tables and a bolted-on vector database.

**① Signal in.** `detect_conditions` reads whatever disruption signals are currently active for this session from `external_conditions` — in production this would be whatever a live monitoring feed had most recently written there.

**② Exposure mapped.** `match_suppliers` finds who's actually affected. **Geo Search** (`$geoWithin`/`$centerSphere`) turns "who sits inside this disruption's radius" into a single aggregation stage instead of an application loop computing distance supplier by supplier; a signal with no physical footprint — a tariff, a sanction — matches by region instead. In the same pass, an **aggregation pipeline** pulls the business stakes straight from `purchase_orders` — which orders are open, what they're worth, how close the delivery window is — so exposure and urgency arrive together, not from two separate round trips.

**③ Severity scored.** `calculate_rpn` applies the FMEA formula to produce an **RPN — Risk Priority Number** — the product of three factors: **severity** (how bad the impact would be if it happens), **occurrence** (how likely it is), and **detection** (how easily it'd be noticed before it actually hits). It's the same scoring method used across manufacturing and supply-chain quality management, with a distance-based decay added here for physical risks. The resulting number is compared against a per-risk-type threshold in `risk_catalog` to produce a status: OK, WATCH, ALERT, or CRITICAL. Pure arithmetic; nothing left for MongoDB to do at this step because nothing here is ambiguous.

**④ Precedent weighed.** `reason_and_retrieve` is where the system asks the one question a formula can't answer on its own: has something like this happened before, and should that change the score? **Vector Search** (`$vectorSearch` on `agent_memory`, filtered by risk type, with no supplier filter) is what makes the answer possible at all — a lookup keyed by supplier could only ever say "has this happened to this one supplier," never "has this happened to anyone comparable." A supplier with zero history of its own can still be weighted by what happened to someone else under a similar condition.

**⑤ Decision written.** `generate_summary` turns the final, precedent-adjusted numbers into the plain-language write-up a manager reads, and the result lands in `supplier_risk_evaluations` — the trigger for whether `alternative_finder` gets called at all.

**Why MongoDB:** one cluster carries the geospatial filter, the operational cross-reference, and the semantic precedent search this evaluation needs. The alternative is three systems and an application layer stitching them together every time a supplier gets scored.



---

## 1. How this module works

Real `StateGraph`, five nodes, strictly linear, no branching:

```
detect_conditions → match_suppliers → calculate_rpn → reason_and_retrieve → generate_summary
```

Three of these five never touch an LLM — `detect_conditions`, `match_suppliers`, and `calculate_rpn` are exact: a lookup, a geometric test, a formula. Tokens are spent only where the answer genuinely isn't computable in advance: `reason_and_retrieve`, a real ReAct loop, and `generate_summary`, which writes the narrative (two LLM calls per supplier, not one).


### 1.1 `reason_and_retrieve` — the one node that reasons, and the only one that touches memory

Every real lookup this module makes against `agent_memory` happens here — this is the single path historical precedent actually takes at runtime. The loop itself is Thought → Action → Observation. It runs as **one loop shared across every supplier exposed in the session, not one per supplier**: the full context for the whole group is assembled into a single prompt, and the model returns one weight map covering all of them at once. That's deliberate — it lets the model reason comparatively ("this supplier saw exactly this condition before; this other one is different because...") instead of reaching a possibly inconsistent conclusion for each supplier in isolation.

Three tools are available inside the loop:

| Tool | Signature | Purpose |
|---|---|---|
| `search_supplier_memory` | `(supplier_ids: list[str], ...)` | A supplier's own relevant episodes |
| `get_order_detail` | `(supplier_ids: list[str], ...)` | Order context for a batch of suppliers |
| `search_combined_episodes` | `(supplier_id: str, risk_type, ...)` | Cross-supplier `$vectorSearch` on `agent_memory`, filtered by `risk_type` only |


### 1.2 How a precedent changes the score

The RPN itself is a simple product:

| Factor | Meaning |
|---|---|
| `severity` | How bad the impact would be if this risk actually materializes |
| `occurrence` | How likely this risk is to happen at all |
| `detection` | How easily it'd be spotted before it actually hits the business |

`rpn_dynamic = severity × occurrence × detection` (with a distance-decay multiplier applied first, for physical risks). This raw number is compared against `alert_threshold_rpn` — a fixed value per risk type in `risk_catalog` — to decide the status: **OK** (well below threshold), **WATCH**, **ALERT**, or **CRITICAL** (at or above it, or pushed there by precedent).

When the loop finds a real, relevant episode, the weight it derives is applied directly to that supplier's RPN — the score is recalculated, re-checked against `alert_threshold_rpn`, and the resulting status (which can step all the way from ALERT to CRITICAL) is what gets persisted, alongside the weight itself, inside that supplier's `triggered_by` entry. See §2 for a concrete before/after example. When the loop finds nothing relevant, the honest result is a neutral weight of `1.0` — the design never invents a precedent to fill the gap.


### 1.3 Agent Activation

-  `stream_listener.py` stub sketches what a MongoDB Change Stream listener on `external_conditions` would look like, but nothing invokes it. The demo is a guided, step-by-step workflow — a manager (or presenter) explicitly clicks "Evaluate risk" at a specific point in the flow; a Change Stream reacting the instant a signal lands would fire the evaluation before that step is reached, taking control away from the walkthrough instead of supporting it. So what's actually built is request-triggered: the graph runs once per `POST /api/simulation/evaluate` call and narrates its own execution live over SSE, with no separate process watching the database. A live Change Stream is the natural fit for a production system reacting to signals with no person in the loop; it isn't what this demo's guided flow needs. (Confirm the exact reasoning against ADR-003 if you want it stated in the team's own words.)

---

## 2. Anatomy of a `supplier_risk_evaluations` document


```json
{
  "evaluation_id": "EVAL-2026-0441-A",
  "supplier_id": "SUP-SHENZHEN-441",
  "supplier_name": "Shenzhen Advanced Materials Co.",
  "region": "CN",
  "country": "China",
  "product_categories": ["packaging_materials"],
  "operational_context": {
    "active_orders": 1,
    "value_at_risk_usd": 980000,
    "promotional_window": true,
    "days_until_due": 28
  },
  "risk_scores": [
    {
      "risk_id": "RISK-GEO-001",
      "risk_type": "geopolitical_tariff",
      "rpn_base": 299,
      "triggered_by": { "historical_weight": 1.35 },
      "rpn_dynamic": 403.65,
      "status": "CRITICAL"
    }
  ],
  "supplier_risk_level": "CRITICAL",
  "requires_action": true,
  "memory_episodes_used": ["MEM-20250315-SHZ441"],
  "natural_language_summary": "Shenzhen Advanced Materials Co. is now CRITICAL...",
  "glossary": [
    { "term": "RPN", "definition": "Risk Priority Number — severity × occurrence × detection." }
  ]
}
```

`risk_scores[]` carries one entry per active risk type; `triggered_by.historical_weight` is where precedent actually lands — the base RPN and the recalculated `rpn_dynamic` sit side by side so the shift is visible, not just the final number. `memory_episodes_used` is populated here even though it doesn't travel over SSE (§1.2). `glossary` is a fixed internal dictionary, not model-written — the same shape `alternative_finder` uses for its own candidate rationales.

---

## 3. Collections touched by this module

| Op | Collection | Filter / query |
|---|---|---|
| READ | `external_conditions` | session-scoped active signals |
| READ | `purchase_orders` | operational context per exposed supplier |
| READ | `suppliers` | `$geoWithin`/`$centerSphere`, or region match |
| READ | `agent_memory` | `$vectorSearch` by `risk_type`, plain `find` — read-only, confirmed zero writes anywhere in this backend |
| **WRITE** | `supplier_risk_evaluations` | `insert_one` — the module's only write |

---

## 4. Endpoint

**`POST /api/simulation/evaluate`**

- **Headers:** `X-Session-ID` required. Confirmed real behavior: **422** if the header is missing entirely, **400** only if present but empty.
- **Request body:** none.
- **Response:** Server-Sent Events, keyed on `type`: `tool_start`, `tool_end`, `atlas_operation`, `agent_thought`, `agent_response` (terminal — carries the full evaluation result), `error`, closing `None` sentinel.
- **Guarantees:** every non-OK supplier gets one written `supplier_risk_evaluations` document, carrying an `evaluation_id` the frontend later passes to `alternative_finder`.

```bash
curl -N -X POST http://localhost:8000/api/simulation/evaluate \
  -H "X-Session-ID: demo-session-123"
```

---

## Related

- ADR-003 — SSE + Change Streams (should cover the `stream_listener.py` decision above)
- ADR-004 — LangGraph checkpointing (none wired in; isolation via `session_id`, not `thread_id`)
- ADR-005 — Operational Data Layer (how this module couples to the others, purely via data)
- ADR-009 — `agent_memory` single-writer closure loop (designed, not built — this module never writes to `agent_memory`)
