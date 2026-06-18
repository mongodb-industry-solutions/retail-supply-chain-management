# Retail Supply Chain Risk — Backend

FastAPI backend for the Retail Supply Chain Risk demo. Simulates external disruption signals, evaluates supplier risk in real time using a LangGraph agent, and surfaces alternative suppliers through a second agentic flow — both agents stream progress to the frontend via Server-Sent Events. MongoDB Atlas is the operational database, vector search index, and LangGraph state checkpointer.

---

## Architecture

The backend is organised as **vertical slices** — three logical services that would be independent microservices in production, running as a single FastAPI app for demo simplicity. Slices never import from each other. The only communication between slices is via MongoDB.

```
Frontend
   │
   ├─ POST /api/simulation/start      → ingestion_engine   (JSON response)
   ├─ POST /api/simulation/evaluate   → risk_evaluator     (SSE stream)
   └─ POST /api/agent/find-alternatives → alternative_finder (SSE stream)
```

---

## The Three Slices

### `ingestion_engine` — Signal Ingestion

Accepts `POST /api/simulation/start`. Generates 3 demo trigger documents — one per risk type (geopolitical, climate, logistics) — and inserts them into `external_conditions`. Returns all 3 inserted documents as a JSON response.

Signal content varies per session to produce different affected suppliers across demo runs. Which suppliers enter alert or critical state is determined entirely by the signal content (affected regions, epicentre coordinates, impact radius) — no supplier is hardcoded.

**Endpoint:** `POST /api/simulation/start`
**Response:** `{ session_id, signals: [{...}, {...}, {...}] }`

---

### `risk_evaluator` — Agent 2, RPN Risk Evaluation

Activated by an explicit `POST /api/simulation/evaluate` from the frontend after ingestion completes. Runs a LangGraph graph that detects active conditions, matches affected suppliers, calculates dynamic RPN scores, retrieves historical memory, and generates a natural-language risk summary via Claude.

Streams agent progress to the frontend via SSE as each node executes.

**Endpoint:** `POST /api/simulation/evaluate`
**Response:** SSE stream → `tool_start` / `tool_end` / `agent_response` / `error` events

> **Production note:** In a production system this agent would be activated by a MongoDB Change Stream watching `external_conditions` for `is_demo_trigger: true` inserts — eliminating the explicit frontend call. The Change Stream activation pattern is documented in `stream_listener.py` and ADR 003 as an educational reference.

---

### `alternative_finder` — Agent 3, Alternative Supplier Search

Human-in-the-loop. Activated by an explicit `POST /api/agent/find-alternatives` when the procurement manager decides to act on a flagged supplier. Runs a LangGraph graph that performs Atlas hybrid search, Voyage AI reranking, and three validation filters (certifications, lead time, capacity).

Streams agent progress to the frontend via SSE as each node executes.

**Endpoint:** `POST /api/agent/find-alternatives`
**Response:** SSE stream → `tool_start` / `tool_end` / `agent_response` / `error` events

---

## Folder Structure

```
backend/
├── main.py                  FastAPI app bootstrap, middleware, router registration, lifespan
├── pyproject.toml           Dependencies and build config (managed with uv)
├── .env.example             Required environment variables (never commit .env)
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
│   └── target_selector.py   Selects disruption scenario deterministically from session_id hash
│
├── risk_evaluator/          Slice 2 — LangGraph RPN risk evaluation (Agent 2)
│   ├── router.py            POST /api/simulation/evaluate → SSE stream
│   ├── graph.py             LangGraph StateGraph definition
│   ├── nodes.py             detect_conditions → match_suppliers → calculate_rpn → retrieve_memory → generate_summary
│   ├── schemas.py           RiskEvaluatorState, RiskScore, EvaluationResult
│   └── stream_listener.py   Production reference only — Change Stream activation pattern (not used in demo)
│
├── alternative_finder/      Slice 3 — LangGraph alternative supplier search (Agent 3)
│   ├── router.py            POST /api/agent/find-alternatives → SSE stream
│   ├── graph.py             LangGraph StateGraph definition
│   ├── nodes.py             hybrid_search → voyage_rerank → validate_certifications → validate_lead_time → validate_capacity
│   └── schemas.py           AlternativeFinderState, Candidate, AlternativeFinderResult
│
├── voyageai/                Thin wrapper around MongoDB-native Voyage AI reranker
│   └── rerank.py            rerank(query, documents, top_k) — executes inside Atlas aggregation pipeline
│
└── adrs/                    Architecture Decision Records
    ├── 001-architecture-overview.md
    ├── 002-async-motor.md
    ├── 003-sse-change-stream.md
    └── 004-langgraph-checkpointing.md
```

---

## Session Model

Every demo run is isolated by a `session_id`. The frontend generates it with `crypto.randomUUID()` on "Start Simulation" click and sends it on every request via the `X-Session-ID` header. The backend never generates or transforms it — it receives, validates (non-empty), and uses it to scope all MongoDB reads and writes.

```
X-Session-ID: sess-abc123
```

| Collection | Session-scoped | Written by | TTL |
|---|---|---|---|
| `external_conditions` | ✅ | ingestion_engine | 2h |
| `supplier_risk_evaluations` | ✅ | Agent 2 | 2h |
| `supplier_alternatives` | ✅ | Agent 3 | 2h |
| `agent_memory` | ✅ | Agent 2 + 3 | 2h |
| `suppliers` | ❌ | Seed data | — |
| `risk_catalog` | ❌ | Seed data | — |
| `purchase_orders` | ❌ | Seed data | — |
| `supplier_documents` | ❌ | Seed data | — |

LangGraph checkpointing uses `thread_id = session_id` — both agents are automatically session-isolated.

Demo cleanup runs via Atlas Scheduled Trigger daily at 00:00 UTC (`deleteMany({ is_base: false, session_id: ... })`). TTL index on session-scoped collections provides a 2h fallback.

---

## SSE Event Structure

Both Agent 2 and Agent 3 use the same event pattern.

```
data: {"type": "tool_start", "message": "Detecting external conditions..."}
data: {"type": "tool_end",   "message": "Detecting external conditions..."}
data: {"type": "agent_response", "data": { ... }}
data: {"type": "error", "message": "..."}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | `tool_start` \| `tool_end` \| `agent_response` \| `error` |
| `message` | string | Human-readable step label shown in the UI |
| `data` | object | Final payload — only present on `agent_response` |
| `phase` | string | `left` \| `right` — Agent 3 only, for two-column UI layout |

---

## Running Locally

```bash
# Install dependencies
uv sync

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your MongoDB URI and API keys

# Start the server
uv run uvicorn main:app --reload
```

API available at `http://localhost:8000`. Health check: `GET /`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DATABASE_NAME` | Target database (default: `retail-supply-chain-risk`) |
| `APP_NAME` | App name tag shown in Atlas (default: `retail-supply-chain-risk`) |
| `ANTHROPIC_API_KEY` | Anthropic API key — used by `generate_summary` node in Agent 2 |
| `VOYAGE_API_KEY` | Voyage AI API key — used by `voyage_rerank` node in Agent 3 |
| `CORS_ORIGINS` | Allowed origins (default: `["*"]` — restrict before production) |

---

## Architecture Decision Records

- [001 — Vertical Slice Architecture](./adrs/001-architecture-overview.md)
- [002 — Motor Async Driver](./adrs/002-async-motor.md)
- [003 — SSE + Change Streams](./adrs/003-sse-change-stream.md) — includes production vs demo activation model
- [004 — LangGraph Checkpointing](./adrs/004-langgraph-checkpointing.md)

---

## Frontend

Maintained separately. See [`/frontend`](../frontend/).
