# `ingestion_engine` — demo signal setup

Plants the data the agents reason about. When the manager clicks "Start
Simulation", this module selects a few (supplier, risk) pairs from live data,
generates one demo disruption signal per pair, and inserts them into
`external_conditions` so `risk_evaluator` has something real to evaluate.

**This is not an agent.** There is no LangGraph graph, no LLM, and no ReAct
loop anywhere in this module. It is a plain deterministic async pipeline; the
only non-determinism is `random.shuffle` / `random.choice` when picking which
suppliers and base signals to use.

---

## What it does, step by step

`run_ingestion(session_id)` (`service.py`) orchestrates two steps:

1. **`select_targets`** (`target_selector.py`) — reads suppliers that have
   active orders, shuffles them, and matches each to a `risk_catalog` entry by
   region, collecting **up to one (supplier, risk) pair per risk type**
   (`geopolitical_tariff`, `logistics_disruption`, `climate_disruption`).
2. **`generate_and_insert_signals`** (`signal_generator.py`) — for each target,
   picks a random matching base signal, computes a `condition_score`, copies
   the base document, overrides the demo-specific fields, and inserts all
   generated signals at once.

If `select_targets` finds nothing, the run returns `{"session_id": ...,
"signals": []}` without writing anything.

### The condition score

`condition_score` is calibrated so at least one supplier is pushed toward
CRITICAL when `risk_evaluator` later runs:

```
condition_score = (alert_threshold_rpn
                   / (severity × occurrence_base × worst_case_weight × detection))
                  × 1.15   # SAFETY_MARGIN
```

`worst_case_weight` is derived deterministically by
`_worst_case_historical_weight` — a **read-only** `find` on `agent_memory`
filtered by `risk_type` (cross-supplier), taking the minimum weight across
matching episodes (`1.20` if a past impact occurred, `0.90` if not), clamped
with `min(1.0, …)`. The clamp means the weight can only *widen* the safety
margin, never narrow it; with no matching episode it falls back to the neutral
`1.0`.

---

## Collections it touches

| Op | Collection | Filter / query |
|----|-----------|----------------|
| READ | `suppliers` | `{"has_active_orders": true}` |
| READ | `risk_catalog` | `{"applies_to_regions": {"$in": [region]}, "risk_type": {"$in": <remaining types>}}` |
| READ | `agent_memory` | `{"risk_type": <type>}` — plain `find`, **read-only** |
| READ | `external_conditions` | `{"is_base": true, "risk_catalog_ref": <risk_id>}` |
| **WRITE** | `external_conditions` | `insert_many(<up to 3 docs>)` |

Only equality / `$in` queries are used — no vector search, geospatial, or
aggregation. **`agent_memory` is read only; this module never writes to it.**

### Shape of the written document

Each inserted signal is a **copy of a randomly chosen `is_base` document**
(with `_id` removed) plus these overrides — there is no Pydantic model for it,
so every other field (e.g. `risk_catalog_ref`, `risk_type_triggered`,
`raw_headline`, `has_physical_location`, `epicentre`, `impact_radius_km`,
`affected_regions`, `source`) is inherited verbatim from the base seed:

| Field | Value |
|-------|-------|
| `condition_score` | the calibrated float above |
| `is_base` | `false` |
| `is_demo_trigger` | `true` |
| `session_id` | the request's session id |
| `condition_id` | `COND-<SESSION8>-<TYPE3>-<UUID6>` |
| `detected_at` | current UTC datetime |
| `valid_until` | `null` |

The `is_demo_trigger: true` + `session_id` pair is exactly what
`risk_evaluator.detect_conditions` filters on — this is the hand-off between
the two modules (via the shared collection, not a function call).

---

## How to invoke it

- **Endpoint:** `POST /api/simulation/start` (mounted in `main.py`).
- **Header:** `X-Session-ID` is required. Missing or empty/whitespace →
  **HTTP 400** (`"X-Session-ID header is required and cannot be empty."`).
- **Request body:** none.
- **Response:** plain JSON (not SSE):
  `{"session_id": "<id>", "signals": [<inserted docs, _id stripped>]}`.
- **Errors:** if a target's `risk_catalog_ref` has no base signal in
  `external_conditions`, it raises `SignalGenerationError` (surfaces as 500).

```bash
curl -X POST http://localhost:8000/api/simulation/start \
  -H "X-Session-ID: demo-session-123"
```
