# ADR 004 — LangGraph with MongoDB Checkpointer Scoped by session_id

## Status
Accepted

## Context

This is a multi-user demo. Multiple Solutions Architects may run the demo simultaneously, each with their own browser session. Each session must produce isolated, independent graph executions — one user's risk evaluation must not bleed into another's state.

LangGraph supports persistence and state isolation via a checkpointer. The checkpointer stores graph state between node executions, enabling resume, replay, and memory across turns. MongoDB is already in use as the operational database, making it a natural choice for the checkpointer backend.

## Decision

Use **`MongoDBSaver`** from `langgraph-checkpoint-mongodb` as the LangGraph checkpointer for both `risk_evaluator` and `alternative_finder` graphs.

Set `thread_id = session_id` for every graph invocation. LangGraph uses `thread_id` as the primary isolation key for checkpointed state — all state written by a graph run is namespaced under this ID.

```python
from langgraph.checkpoint.mongodb import MongoDBSaver

checkpointer = MongoDBSaver(db)
graph = compiled_graph.with_config({"configurable": {"thread_id": session_id}})
```

### Session Lifecycle

Each demo session is initiated by the frontend sending an `X-Session-ID` header (validated in `core/session.py`). This ID flows through:

1. `ingestion_engine` — stored on every `external_conditions` document for Change Stream filtering.
2. `risk_evaluator` — used as `thread_id` for checkpointer and as the Change Stream filter key.
3. `alternative_finder` — used as `thread_id` for checkpointer.

### Session Reset

To reset a session (restart the demo), delete all documents in the checkpointer collection where `thread_id = session_id`, and delete matching documents from `external_conditions`. This is a single `deleteMany` per collection.

## Consequences

**Positive**
- Automatic state isolation per session — no custom partitioning logic needed.
- LangGraph's built-in replay and resume capabilities work out of the box per session.
- The `retrieve_memory` node in `risk_evaluator` can access prior evaluation history for the same session, enabling contextual LLM summaries that reference earlier disruptions in the same demo run.
- Cleanup is a single `deleteMany` query per collection.

**Negative**
- `MongoDBSaver` uses the synchronous PyMongo client internally (as of langgraph-checkpoint-mongodb 0.x). This means checkpointer writes block the event loop unless wrapped in `run_in_executor`. Monitor the `langgraph-checkpoint-mongodb` package for an async Motor-compatible version.
- Long-running demo sessions accumulate checkpoint documents. Add a TTL index on the checkpoint collection for automatic expiry in demo environments.
