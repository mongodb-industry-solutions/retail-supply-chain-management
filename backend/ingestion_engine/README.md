# `ingestion_engine` — deterministic scenario generator

![ingestion_engine architecture](../../docs/images/ingestion_engine_diagram.png)

> **Diagram placeholder.** The image above is not in the repository yet. Module
> diagrams live in the project's `docs/images/` folder (there is no root-level
> `images/` folder — *to verify* whether one is planned). Existing files there
> are `architecture.png`, `architecture_overview.png`,
> `architecture_detailed.jpg` and `workflow_diagram.png`, so **no per-module
> naming convention exists yet**; this README proposes
> `<module_name>_diagram.png` — i.e. `ingestion_engine_diagram.png`.

---

## 1. What this module demonstrates

`ingestion_engine` seeds each demo session with a realistic supply-chain risk
scenario. It is the first step of the demo flow: it plants the signals that
`risk_evaluator` will later read and score, and that `alternative_finder` will
ultimately react to.

**It is not an agent.** There is no LangGraph graph, no LLM call, and no
reasoning loop anywhere in this module — the whole module is four files
(`router.py`, `service.py`, `target_selector.py`, `signal_generator.py`) of
plain async Python and MongoDB queries. The only non-determinism is
`random.shuffle` / `random.choice` when choosing which supplier, which risk and
which base signal to use.

**Why it exists:** a demo needs a risk scenario that is realistic *and*
reproducible. Every session must land on at least one supplier whose dynamic RPN
crosses its `alert_threshold_rpn`, otherwise the downstream agents have nothing
interesting to show. Rather than hand-crafting a fixture, this module derives the
signal magnitude from live catalog data at run time, so the scenario stays
consistent with whatever is currently in the database.

**What it is not trying to be:** a neutral, live simulation of the real world. It
does not model actual events, probabilities, or an unbiased distribution of
outcomes. It works *backwards* from the alert threshold to guarantee an alert.
See §2.

---

## 2. What this engine really is, and why — grounded in code

`run_ingestion(session_id)` (`service.py`) runs two steps and returns
`{"session_id": ..., "signals": [...]}`. If step 1 selects nothing, it returns
an empty `signals` list and writes nothing.

### 2.1 Target selection — `target_selector.py`

`select_targets(db)` produces **up to one `(supplier, risk)` pair per risk
type**, for the three types hard-coded in `_RISK_TYPES`:
`geopolitical_tariff`, `logistics_disruption`, `climate_disruption`. So the
maximum is three pairs per session.

The logic:

1. Read `suppliers` with the pre-filter `{"has_active_orders": True}` — suppliers
   without active orders are **never selectable**. This is the only pre-filter on
   the supplier side.
2. `random.shuffle` the resulting list.
3. Walk the shuffled suppliers. For each one, query `risk_catalog` for entries
   where `applies_to_regions` contains the supplier's `region` **and** whose
   `risk_type` is one of the types not yet covered. A supplier whose region
   matches no remaining catalog entry is skipped.
4. `random.choice` one of the matching risks, record the pair, mark that
   `risk_type` as covered, and stop early once all three types are covered.

Consequences that follow directly from the code: a supplier can appear at most
once (the loop advances per supplier), each risk type appears at most once, and
region coverage in `risk_catalog.applies_to_regions` is what ultimately decides
which suppliers are reachable.

### 2.2 The `condition_score` formula — `signal_generator.py`

For each target, the score is computed exactly as:

```python
condition_score = (
    risk["alert_threshold_rpn"]
    / (risk["severity"] * risk["occurrence_base"] * worst_case_weight * risk["detection"])
) * SAFETY_MARGIN          # SAFETY_MARGIN = 1.15
```

| Variable | Where it comes from | What it is |
|---|---|---|
| `alert_threshold_rpn` | the selected `risk_catalog` document | RPN value at or above which `risk_evaluator` raises an alert for this risk |
| `severity` | same `risk_catalog` document | FMEA severity factor of the risk |
| `occurrence_base` | same `risk_catalog` document | FMEA baseline occurrence factor, before any signal scaling |
| `detection` | same `risk_catalog` document | FMEA detectability factor |
| `worst_case_weight` | computed from `agent_memory` — see §2.3 | worst-case historical multiplier the evaluator might apply later |
| `SAFETY_MARGIN` | module constant `1.15` in `signal_generator.py` | fixed 15 % headroom above the threshold |

This is the FMEA formula solved for the signal magnitude. `risk_evaluator`
computes `rpn_dynamic = severity × (occurrence_base × condition_score) ×
detection` (`risk_evaluator/nodes.py`), so dividing the threshold by the other
three factors yields precisely the `condition_score` that lands *on* the
threshold, and `× 1.15` puts it 15 % above.

### 2.3 `historical_weight` — `_worst_case_historical_weight`

```python
episodes = await db["agent_memory"].find({"risk_type": risk_type}).to_list(length=None)
```

- A plain **read-only `find`** (not a vector search), filtered by `risk_type`
  only — i.e. **cross-supplier**. `ingestion_engine` never writes to
  `agent_memory`.
- Per episode, the weight is derived from
  `episode.actual_impact.occurred`: `1.20` if `True`, `0.90` if `False`.
  Episodes with no `occurred` key are excluded entirely.
- The **minimum** across matching episodes is taken (worst case for the
  guarantee), then clamped: `min(1.0, min(weights))`.
- If no episode matches, or none carries `occurred`, it returns
  `HISTORICAL_WEIGHT_DEFAULT = 1.0`.

The clamp is deliberate and is documented in the source: the worst-case weight
may only **widen** the safety margin (an attenuating episode, `0.90`), never
**narrow** it. An amplifying episode (`1.20`) would otherwise shrink
`condition_score` and make the alert guarantee depend on the evaluator
re-applying that same amplification at runtime — so amplifiers clamp back to
neutral `1.0`.

### 2.4 This is intentional reverse-engineering — read this before reusing it

The formula above is **not** a model of how severe a real disruption is. It is
the alert threshold run backwards: the module is told what outcome the demo needs
(at least one supplier above `alert_threshold_rpn`) and computes the signal
magnitude that produces it, with margin. That is a deliberate design decision for
demo reliability, not production logic. In a real system, `condition_score` would
come from an external feed and the resulting RPN would be whatever it is —
possibly below every threshold.

Two honest caveats visible in the code:

- The `1.15` margin is **not** guaranteed to survive the evaluator's
  `distance_decay`, which multiplies `rpn_dynamic` by as little as `0.70` for
  physical signals far from the epicentre (`risk_evaluator/nodes.py`). For those
  signals the alert is likely, not arithmetically certain.
- In the graph that actually runs, `historical_weight` is derived by an **LLM
  ReAct loop** in `reason_and_retrieve`, which can return any float (defaulting
  to `1.0`). The deterministic `1.20`/`0.90` `occurred` rule that
  `_worst_case_historical_weight` mirrors lives in `retrieve_memory`, which its
  own docstring marks as *"NOT wired into the current graph"*. So the worst-case
  weight defends against a rule that is currently dormant downstream; it does not
  bound what the LLM may return.

---

## 3. Anatomy of an `external_conditions` document

Each generated signal is a **copy of a randomly chosen `is_base: true` document**
(`_id` stripped) for the target's `risk_catalog_ref`, with a fixed set of fields
overridden. There is no Pydantic model for the written document, so every field
not listed as overridden is inherited verbatim from the base seed. If no base
signal exists for a `risk_catalog_ref`, `SignalGenerationError` is raised.

All 16 fields, as observed in `docs/database-files/external_conditions.json`
(206 seed documents) and in the writer code:

| Field | Origin | Applies to | What it is |
|---|---|---|---|
| `condition_id` | **overridden** | all | Identifier of this signal; generated as `COND-<SESSION8>-<TYPE3>-<UUID6>` |
| `risk_catalog_ref` | inherited | all | `risk_id` of the `risk_catalog` entry this signal instantiates |
| `risk_type_triggered` | inherited | all | Risk type carried by the signal (the evaluator scores against the *catalog's* `risk_type`, which can in principle differ) |
| `source` | inherited | all | Name of the notional feed the signal came from (e.g. `MarineTraffic`, `GDELT`) |
| `raw_headline` | inherited | all | Human-readable one-line description, surfaced in the UI and in LLM prompts |
| `affected_regions` | inherited | all | Region codes the signal covers; used to match suppliers when the signal has no coordinates |
| `condition_score` | **overridden** | all | Calibrated signal magnitude from §2.2; scales `occurrence_base` in the evaluator's RPN |
| `has_physical_location` | inherited | all | Flag telling the evaluator whether to use geospatial matching + distance decay or region matching |
| `epicentre` | inherited | **physical only** (139/206 seeds) | GeoJSON `Point` of the event centre |
| `impact_radius_km` | inherited | **physical only** (139/206 seeds) | Radius of the impact zone, used for both the geospatial query and the distance decay |
| `detected_at` | **overridden** | all | Set to `datetime.now(timezone.utc)` at generation time |
| `valid_until` | **overridden** | all | Set to `None` — no expiry is modelled |
| `is_base` | **overridden** | all | Set to `False`; distinguishes the generated signal from the seed it was copied from |
| `is_demo_trigger` | **overridden** | all | Set to `True`; marks the document as a generated demo signal |
| `session_id` | **overridden** | all | The request's session id |
| `_id` | dropped, then Mongo-assigned | all | Base `_id` is removed before insert; stripped again from the API response |

### Demo control fields, not business meaning

`is_base`, `is_demo_trigger` and `session_id` are **demo control metadata**. They
say nothing about the risk itself — they exist so the system can tell seed data
from generated data and scope generated data to one session. `is_base: true`
documents are the template library; `is_demo_trigger: true` + `session_id` is
exactly the filter `risk_evaluator.detect_conditions` uses
(`{"session_id": ..., "is_demo_trigger": True}`), which makes the shared
collection — not a function call — the hand-off between the two modules.

### Collections touched

| Op | Collection | Filter / query |
|---|---|---|
| READ | `suppliers` | `{"has_active_orders": true}` |
| READ | `risk_catalog` | `{"applies_to_regions": {"$in": [region]}, "risk_type": {"$in": <remaining types>}}` |
| READ | `agent_memory` | `{"risk_type": <type>}` — plain `find`, **read-only** |
| READ | `external_conditions` | `{"is_base": true, "risk_catalog_ref": <risk_id>}` |
| **WRITE** | `external_conditions` | `insert_many(<up to 3 docs>)` |

Only equality and `$in` queries — no vector search, geospatial operators or
aggregation pipelines in this module.

---

## 4. Endpoints

This module exposes exactly one endpoint (`router.py`, mounted in `main.py`):

**`POST /api/simulation/start`**

- **Headers:** `X-Session-ID` is required (`core/session.py`). Missing, empty or
  whitespace-only → **HTTP 400**, detail
  `"X-Session-ID header is required and cannot be empty."`
- **Request body:** none. The session id is the only input.
- **Response:** plain JSON (not SSE) —
  `{"session_id": "<id>", "signals": [<inserted docs, _id stripped>]}`
- **Guarantees:** 0–3 signals, at most one per risk type, each written to
  `external_conditions` with `is_demo_trigger: true` and this `session_id`, and
  each carrying a `condition_score` sized to put its target supplier above
  `alert_threshold_rpn` with a 15 % margin (subject to the `distance_decay`
  caveat in §2.4). Either all documents for the run are inserted or none are —
  the single `insert_many` happens after every score is computed.
- **Errors:** a target whose `risk_catalog_ref` has no `is_base` signal raises
  `SignalGenerationError` (surfaces as HTTP 500) before anything is written.

```bash
curl -X POST http://localhost:8000/api/simulation/start \
  -H "X-Session-ID: demo-session-123"
```

---

## 5. Real-time integration — designed for, not built

In theory, wiring this to a live signal source needs no polling and no explicit
call: `external_conditions` is the collection this module writes to, so a
**MongoDB Change Stream** watching it for inserts could trigger downstream
evaluation the moment a new signal lands, instead of on demand.

**This was deliberately not built that way.** The demo needs control over
timing: the presenter clicks, the scenario is generated, and the UI advances
through visible steps in a predictable order. A dedicated endpoint gives that
control; reacting to a live feed would make the moment of evaluation
unpredictable and hard to narrate. So generation is on demand
(`POST /api/simulation/start`), and downstream evaluation is likewise triggered
by an explicit frontend call.

**Verified in code:** the stub exists, but **not in this module** —
`backend/risk_evaluator/stream_listener.py`. Its top comment reads
`NOT USED IN THE DEMO`, it declares a single
`async def watch_external_conditions(session_id: str)` whose body is `pass`, and
its docstring describes opening a Change Stream on `external_conditions` for
inserts where `is_demo_trigger=True` and `session_id` matches, then triggering the
`risk_evaluator` graph and streaming results over SSE. A repo-wide search
(excluding `.venv`, `node_modules`, `.next`) finds **no import or call of
`stream_listener` or `watch_external_conditions` anywhere** — the only hits are
this file itself, prose references in `backend/README.md`,
`risk_evaluator/graph.py` and ADRs 001/003/005/009. It is genuinely dead code
kept as a design reference; the ADRs state the same. Design rationale is in
`docs/adr/003-backend-sse-change-stream.md`.

---

## Notes on confidence

Everything above is read from `backend/ingestion_engine/*.py`,
`backend/core/session.py`, `backend/risk_evaluator/nodes.py`,
`backend/risk_evaluator/stream_listener.py` and the seed files in
`docs/database-files/`. Items marked *to verify*:

- Whether a **root-level** `images/` folder is intended instead of
  `docs/images/`, and whether `<module>_diagram.png` is the naming convention the
  team wants (nothing in the repo establishes one).
- Field semantics in the table of §3 for **inherited** fields are inferred from
  seed values and from how `risk_evaluator` consumes them; there is no schema
  definition or validator for `external_conditions` in the codebase to confirm
  intent.
