# Retail Supply Chain Risk — Backend

This is the FastAPI backend for the Retail Supply Chain Risk demo. It simulates external disruption signals, evaluates supplier risk in real time using a LangGraph agent, and surfaces alternative suppliers through a second agentic flow — all streamed to the frontend via Server-Sent Events. MongoDB Atlas is the operational database, vector search index, and LangGraph state checkpointer.

## The Three Logical Services

| Slice | What it does |
|---|---|
| `ingestion_engine` | Accepts a `POST /api/simulation/start` request, deterministically selects a target supplier and disruption type for the session, generates 3 demo trigger documents (one per risk type), and inserts them into the `external_conditions` collection. Streams progress to the frontend via SSE. |
| `risk_evaluator` | Activated internally by a MongoDB Change Stream watching `external_conditions` for `is_demo_trigger=True` inserts. Runs a LangGraph graph that detects conditions, matches affected suppliers, calculates RPN scores, retrieves session memory, and generates a streamed LLM risk summary. |
| `alternative_finder` | Activated by an explicit `POST /api/agent/find-alternatives` (human-in-the-loop). Runs a LangGraph graph that performs hybrid search, Voyage AI reranking, and validation (certifications, lead time, capacity) to surface replacement suppliers. Streams results via SSE. |

## Folder Structure

```
backend/
├── main.py                  FastAPI app bootstrap, middleware, router registration, lifespan
├── pyproject.toml           Dependencies and build config (managed with uv)
├── .env.example             Required environment variables
│
├── core/                    Shared infrastructure — imported by all slices, never the reverse
│   ├── config.py            Pydantic-settings Settings class and get_settings() singleton
│   ├── db.py                Motor AsyncIOMotorClient singleton (connect/disconnect/get_database)
│   ├── session.py           FastAPI dependency that validates the X-Session-ID header
│   └── exceptions.py        Custom exceptions: SessionNotFoundError, SignalGenerationError, EvaluationError
│
├── ingestion_engine/        Slice 1 — demo signal ingestion
│   ├── router.py            POST /api/simulation/start
│   ├── service.py           Orchestrates the simulation flow
│   ├── signal_generator.py  Generates demo trigger documents per risk_type
│   └── target_selector.py   Deterministically selects target supplier and alert_type from session_id
│
├── risk_evaluator/          Slice 2 — LangGraph RPN risk evaluation
│   ├── router.py            No HTTP endpoint — activated via Change Stream
│   ├── stream_listener.py   Watches external_conditions collection for demo triggers
│   ├── graph.py             LangGraph StateGraph definition
│   ├── nodes.py             Graph nodes: detect_conditions, match_suppliers, calculate_rpn, retrieve_memory, generate_summary
│   └── schemas.py           Pydantic models: RiskEvaluatorState, RiskScore, EvaluationResult
│
├── alternative_finder/      Slice 3 — LangGraph alternative supplier search
│   ├── router.py            POST /api/agent/find-alternatives
│   ├── graph.py             LangGraph StateGraph definition
│   ├── nodes.py             Graph nodes: hybrid_search, voyage_rerank, validate_certifications, validate_lead_time, validate_capacity
│   └── schemas.py           Pydantic models: AlternativeFinderState, Candidate, AlternativeFinderResult
│
├── voyageai/                Thin wrapper around MongoDB-native Voyage AI reranker
│   └── rerank.py            rerank(query, documents, top_k) — runs inside Atlas aggregation pipeline
│
└── adrs/                    Architecture Decision Records
    ├── 001-architecture-overview.md
    ├── 002-async-motor.md
    ├── 003-sse-change-stream.md
    └── 004-langgraph-checkpointing.md
```

## Running Locally

```bash
# Install dependencies
uv sync

# Copy and fill in environment variables
cp .env.example .env

# Start the server
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`. The health check endpoint is `GET /`.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| `DATABASE_NAME` | Target database name | `retail-supply-chain-risk` |
| `APP_NAME` | Application name tag shown in Atlas | `retail-supply-chain-risk` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (used in `generate_summary` node) | `sk-ant-...` |
| `VOYAGE_API_KEY` | Voyage AI API key (used in `voyage_rerank` node) | `pa-...` |

## Architecture Decisions

See [`/adrs`](./adrs/) for full rationale behind the key technical decisions:

- [001 — Vertical Slice Architecture](./adrs/001-architecture-overview.md)
- [002 — Motor Async Driver](./adrs/002-async-motor.md)
- [003 — SSE + Change Streams](./adrs/003-sse-change-stream.md)
- [004 — LangGraph Checkpointing](./adrs/004-langgraph-checkpointing.md)

## Frontend

The frontend is maintained separately. See [`/frontend`](../frontend/).
