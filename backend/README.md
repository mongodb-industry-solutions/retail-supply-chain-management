# Retail Supply Chain Risk — Backend

FastAPI backend for the Retail Supply Chain Risk demo. Detects external disruption signals, evaluates supplier exposure in real time using a LangGraph agent, and surfaces alternative suppliers through a second agentic flow — both agents stream their reasoning to the frontend via Server-Sent Events. MongoDB Atlas is the operational database, vector search index, and LangGraph state store.

---

## What this system does

A procurement manager at a retail company sources from 40+ suppliers across 18 countries. When the world changes — a tariff announcement, a port closure, a tropical storm — the manager needs to know within seconds: which suppliers are exposed, how seriously, and what orders are at risk.

This system does that automatically. It monitors external signals, calculates a dynamic risk score per supplier (the RPN — Risk Priority Number), and when a supplier crosses the critical threshold it pre-populates a shortlist of alternatives ready for the manager to review and approve. The manager never initiates a search — the system surfaces the situation and the manager decides whether to act.

**The core design principle**: the system informs, never acts. Every write to the ERP or supplier system requires explicit human approval. The agents reason and recommend; the human decides.

---

## How the risk score works

The RPN formula is borrowed from FMEA (Failure Mode and Effects Analysis):

```
rpn_base    = severity × occurrence_base × detection
rpn_dynamic = severity × (occurrence_base × condition_score) × detection × historical_weight
```

- `severity` and `detection` are fixed properties of the risk type — encoded once in `risk_catalog` by the procurement team
- `condition_score` comes from the live signal — how strongly does this event indicate actual disruption (0.0–1.0)
- `historical_weight` comes from `agent_memory` — did this supplier fail under similar conditions before? (amplifies or dampens the score)

A supplier breaches ALERT or CRITICAL when the dynamic RPN exceeds the threshold defined for that risk type. Fresh produce thresholds are tighter than packaged goods thresholds — a delayed avocado shipment has no buffer; a delayed cereal shipment does.

---

## Architecture

The backend is organised as **vertical slices** — three logical services that would be independent microservices in production, running as a single FastAPI app for demo simplicity. Slices never import from each other. Each service reads from MongoDB collections it does not own — never calls other slices directly. This is the Operational Data Layer pattern documented in [ADR 005](./adrs/005-operational-data-layer.md).

```
Frontend
   │
   ├─ POST /api/simulation/start        → ingestion_engine   (JSON response)
   ├─ POST /api/simulation/evaluate     → risk_evaluator     (SSE stream)
   └─ POST /api/agent/find-alternatives → alternative_finder (SSE stream)
```

---

## The three slices

### `ingestion_engine` — Demo signal setup

Not an agent. Its only job is to plant the right data in MongoDB so the agents have something real to reason about when the manager clicks "Activate Demo".

It selects up to 3 suppliers at random (those with active orders), picks matching base signals from `external_conditions` (one per risk type: geopolitical, logistics, climate), and calculates a `condition_score` calibrated to guarantee at least one supplier reaches CRITICAL when Agent 1 runs. The calibration formula is:

```
condition_score = (alert_threshold_rpn / (severity × occurrence_base × 1.0 × detection)) × 1.15
```

The 1.15 safety margin means the result is robust — Agent 1's memory retrieval can amplify or dampen the score without accidentally dropping below the alert threshold. The signals inserted are structurally identical to what a real feed (GDELT, MarineTraffic, NOAA) would produce — the agents never know the difference.

**Endpoint:** `POST /api/simulation/start` → JSON response

---

### `risk_evaluator` — Agent 1, RPN evaluation

A LangGraph workflow with 5 linear nodes. Activated by the frontend after ingestion completes. Streams its progress step by step via SSE so the UI shows the agent reasoning in real time.

```
detect_conditions → match_suppliers → calculate_rpn → retrieve_memory → generate_summary
```

**detect_conditions** — reads the session's active signals from `external_conditions`.

**match_suppliers** — for each signal, finds exposed suppliers. Signals with a physical location (port congestion, storms) use a `$geoWithin $centerSphere` query on `suppliers.location` — two suppliers in the same country receive different scores depending on how far they are from the epicentre. Signals without a physical location (tariff announcements) match by region string. Crosses with `purchase_orders` to build the operational context: how many orders, how much money, how many days until the nearest due date.

**calculate_rpn** — applies the RPN formula for each (supplier, signal) pair. Applies distance decay for physical signals. Determines `rpn_status` against the risk catalog thresholds.

**retrieve_memory** — vector search on `agent_memory` for semantically similar past episodes. If a supplier failed under comparable conditions before, `historical_weight = 1.20` amplifies the RPN. If they navigated it successfully, `historical_weight = 0.90` dampens it. No prior memory defaults to `1.0` — consistent with the ingestion engine's calibration assumption. Memory failure is caught silently and never breaks the graph.

**generate_summary** — calls Claude to write a concise natural-language summary per supplier for the procurement manager. Inserts the full evaluation document into `supplier_risk_evaluations`. Emits the final `agent_response` SSE event.

**Endpoint:** `POST /api/simulation/evaluate` → SSE stream

> **Production note:** In a real deployment this agent would be triggered by a MongoDB Change Stream watching `external_conditions` for new `is_demo_trigger: true` inserts — eliminating the explicit frontend call. The pattern is documented in `stream_listener.py` and [ADR 003](./adrs/003-sse-change-stream.md).

---

### `alternative_finder` — Agent 2, alternative supplier search

Human-in-the-loop. Only runs when the procurement manager explicitly clicks "Find alternatives" on a flagged supplier. Takes the `supplier_risk_evaluations` document as its brief and runs a structured search pipeline:

```
hybrid_search → voyage_rerank → validate_certifications → validate_lead_time → validate_capacity
```

**hybrid_search** — combines vector search (semantic similarity on supplier profiles) and BM25 full-text search on `supplier_documents` (contracts, certificates, audit reports), merged with Reciprocal Rank Fusion.

**voyage_rerank** — reranks the hybrid search results using Voyage AI's reranking model running natively inside Atlas.

**validate_certifications** — reads `supplier_documents` chunks to verify that candidate certifications are valid and in scope for the product category. Candidates with expired or out-of-scope certifications are discarded with cited evidence.

**validate_lead_time** — compares each candidate's `avg_lead_time_days` against the `days_until_due` of the at-risk orders. Flags candidates where the lead time would cause a late delivery.

**validate_capacity** — checks `committed_capacity_pct` to confirm the candidate has headroom to absorb additional volume.

The agent writes the shortlist to `supplier_alternatives` and pauses. The `approved_supplier_id` field is null — the ERP integration does not fire until the manager explicitly approves a candidate.

**Endpoint:** `POST /api/agent/find-alternatives` → SSE stream

> **Status**: Agent 2 is not yet wired into the server. The router is commented out in
> `main.py` and will return 404. Implementation is in progress.

---

## Folder structure

```
backend/
├── main.py                  FastAPI app bootstrap, middleware, router registration, lifespan
├── pyproject.toml           Dependencies and build config (managed with uv)
├── .env.example             Required environment variables (never commit .env)
├── architecture.png         Architecture diagram — ODL pattern and slice boundaries
│
├── core/                    Shared infrastructure — imported by slices, never the reverse
│   ├── config.py            Pydantic-settings Settings class and get_settings() singleton
│   ├── db.py                Motor AsyncIOMotorClient singleton (connect / disconnect / get_database)
│   ├── session.py           FastAPI dependency — validates and extracts X-Session-ID header
│   └── exceptions.py        Custom exceptions: SessionNotFoundError, SignalGenerationError, EvaluationError
│
├── ingestion_engine/        Slice 1 — demo signal ingestion
│   ├── router.py            POST /api/simulation/start → JSON response
│   ├── service.py           Orchestrates target selection, signal generation, and MongoDB insert
│   ├── signal_generator.py  Builds 3 demo trigger documents (one per risk type)
│   └── target_selector.py   Shuffles active-order suppliers, matches risk_catalog by region, picks up to 3 pairs
│
├── risk_evaluator/          Slice 2 — LangGraph RPN risk evaluation (Agent 1)
│   ├── router.py            POST /api/simulation/evaluate → SSE stream
│   ├── graph.py             LangGraph StateGraph definition
│   ├── nodes.py             detect_conditions → match_suppliers → calculate_rpn → retrieve_memory → generate_summary
│   ├── schemas.py           RiskEvaluatorState, RiskScore, EvaluationResult
│   └── stream_listener.py   Production reference only — Change Stream activation pattern (not used in demo)
│
├── alternative_finder/      Slice 3 — LangGraph alternative supplier search (Agent 2)
│   ├── router.py            POST /api/agent/find-alternatives → SSE stream
│   ├── graph.py             LangGraph StateGraph definition
│   ├── nodes.py             hybrid_search → voyage_rerank → validate_certifications → validate_lead_time → validate_capacity
│   └── schemas.py           AlternativeFinderState, Candidate, AlternativeFinderResult
│
├── voyageai/                Thin wrapper around MongoDB-native Voyage AI reranker
│   └── rerank.py            rerank(query, documents, top_k) — executes inside Atlas aggregation pipeline
│
├── dataset/                 Seed files and setup guide
│   ├── seeds_README.md      Step-by-step cluster setup, indexes, and replication guide
│   ├── suppliers_seed.json
│   ├── risk_catalog_seed.json
│   ├── purchase_orders_seed.json
│   ├── supplier_documents_seed.json
│   └── external_conditions_seed.json
│
└── adrs/                    Architecture Decision Records
    ├── 001-architecture-overview.md
    ├── 002-async-motor.md
    ├── 003-sse-change-stream.md
    ├── 004-langgraph-checkpointing.md
    └── 005-operational-data-layer.md
```

---

## Data model overview

Eight MongoDB collections divided into two groups:

**Fixed seed data** — never written by agents, never deleted on demo reset:

| Collection | Purpose |
|---|---|
| `suppliers` | Master supplier register. 40 suppliers across 18 countries. Polymorphic document model — CN/TW suppliers carry `tariff_exposure_rating`, fresh produce suppliers carry `cold_chain_certified`. GeoJSON `location` field powers geo queries. |
| `risk_catalog` | FMEA scores per risk type. Encodes procurement expertise: severity, occurrence, detection, and alert/critical thresholds. Maintained by the procurement team, never by agents. |
| `purchase_orders` | 620 active orders across all suppliers. Provides the financial and timing context that makes a risk score meaningful — which orders are at stake, how much value, how many days until due. |
| `supplier_documents` | 146 document chunks (contracts, certificates, audit reports, sustainability reports, emails). Chunked at 400–600 tokens with overlap. Hybrid Search index (vector + BM25) powers Agent 2's certification validation. |

**Session-scoped data** — written by agents during a demo run, cleaned up on reset:

| Collection | Written by | Purpose |
|---|---|---|
| `external_conditions` | ingestion_engine | Active risk signals. Base signals (pre-loaded, always green) plus demo trigger signals (inserted at runtime, calibrated to push suppliers into CRITICAL). TTL index auto-expires demo triggers. |
| `supplier_risk_evaluations` | Agent 1 | One document per evaluated supplier per session. Contains the dynamic RPN, which signals caused it, the operational context, and the natural-language summary Claude generated. This is what the manager reads on the dashboard. |
| `agent_memory` | Agent 1 + 2 | Historical risk episodes. Each episode records what happened, whether the disruption materialised, what it cost, and how it was resolved. Voyage AI embeddings enable semantic retrieval — "tariff escalation affecting CN packaging supplier" retrieves the relevant episode regardless of exact wording. |
| `supplier_alternatives` | Agent 2 | The shortlist Agent 2 produces. Paused until the manager approves — `approved_supplier_id: null` means the ERP integration has not fired. |

> **Setup required**: the `agent_memory_autoembed_index` vector search index must be
> created in Atlas before memory retrieval works. Without it, the `retrieve_memory` node
> falls back to `historical_weight = 1.0` silently. Index setup is covered in
> `dataset/seeds_README.md`.

---

## Session model

Every demo run is isolated by a `session_id`. The frontend generates it with `crypto.randomUUID()` on "Start Simulation" click and sends it on every request via the `X-Session-ID` header. The backend never generates or transforms it.

```
X-Session-ID: sess-abc123
```

LangGraph checkpointing uses `thread_id = session_id` — both agents are automatically session-isolated. Demo cleanup runs via Atlas Scheduled Trigger daily at 00:00 UTC (`deleteMany({ is_base: false, session_id: "..." })`).

---

## SSE event structure

Both agents use the same event pattern:

```
data: {"type": "tool_start", "message": "Detecting active risk signals..."}
data: {"type": "tool_end",   "message": "Detecting active risk signals..."}
data: {"type": "agent_response", "data": { ... }}
data: {"type": "error", "message": "..."}
```

Agent 2 adds a `phase` field (`"left"` or `"right"`) to support the two-column UI layout showing retrieval and validation side by side.

**Testing the SSE stream with curl:**
```bash
# Step 1 — generate signals
curl -s -X POST http://localhost:8000/api/simulation/start \
  -H "X-Session-ID: my-session-001" | python3 -m json.tool

# Step 2 — run the agent (SSE stream)
curl -N -X POST http://localhost:8000/api/simulation/evaluate \
  -H "X-Session-ID: my-session-001"
```
The `-N` flag disables curl buffering so SSE events appear in real time.

---

## Running locally

### Prerequisites
- Python 3.13+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) — install with `curl -LsSf https://astral.sh/uv/install.sh | sh`
- MongoDB Atlas cluster with the seed data loaded — follow `backend/dataset/seeds_README.md` before starting the server

### Setup
```bash
# From the backend/ directory
cd backend
uv sync
cp .env.example .env
# Edit .env with your credentials — see Environment Variables section below
uv run uvicorn main:app --reload
```

API available at `http://localhost:8000`. Health check: `GET /`.

---

## Environment variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DATABASE_NAME` | Target database (default: `retail-supply-chain-risk`) |
| `APP_NAME` | App name tag shown in Atlas (default: `retail-supply-chain-risk`) |
| `LLM_API_KEY`       | API key for the LLM gateway                                        |
| `LLM_BASE_URL`      | Base URL for the LLM endpoint. Use `https://api.anthropic.com` for direct Anthropic access, or your organization's gateway URL. |
| `ANTHROPIC_MODEL`   | Claude model name (e.g. claude-opus-4-7)                           |
| `VOYAGE_API_KEY` | Voyage AI API key — used by `voyage_rerank` node in Agent 2 |
| `CORS_ORIGINS` | Allowed origins (default: `["*"]` — restrict before production) |

---

## Architecture Decision Records

- [001 — Vertical Slice Architecture](./adrs/001-architecture-overview.md)
- [002 — Motor Async Driver](./adrs/002-async-motor.md)
- [003 — SSE + Change Streams](./adrs/003-sse-change-stream.md)
- [004 — LangGraph Checkpointing](./adrs/004-langgraph-checkpointing.md)
- [005 — Operational Data Layer](./adrs/005-operational-data-layer.md)

---

## API contract

Every request sends `X-Session-ID` in the header. The backend never generates or modifies the session — it uses it exclusively to scope MongoDB reads and writes.

> **Important**: the two endpoints must be called in order. Call `/api/simulation/start`
> first to generate the risk signals for the session. Only then call
> `/api/simulation/evaluate` — it reads the signals inserted by the previous step.
> Calling evaluate before start will return an empty result.

### `POST /api/simulation/start`

No request body. Returns the 3 inserted signal documents as JSON.

### `POST /api/simulation/evaluate`

No request body. Returns an SSE stream. Final event is `agent_response` with the full evaluation result including all suppliers, their risk scores, and natural-language summaries.

### `POST /api/agent/find-alternatives`

```json
{ "supplier_id": "SUP-SHENZHEN-441" }
```

Returns an SSE stream. Final event is `agent_response` with the ranked shortlist of alternative suppliers including validation results and cited evidence.

