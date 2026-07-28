# ADR 004 — LangGraph with MongoDB Checkpointer Scoped by session_id

## Status
Accepted as a design decision, **not yet implemented in code.** The rationale below stands as the intended approach; see **Current implementation status** for what the graphs actually do today (in-memory, no checkpointer).

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

## Current implementation status

**No checkpointer is wired into either graph today — this decision is not yet implemented.**

- Both `risk_evaluator/graph.py` and `alternative_finder/graph.py` call `builder.compile()` with **no** `checkpointer` argument. `MongoDBSaver` is not instantiated anywhere in the codebase, and no `thread_id` is set on either graph.
- Each request runs the graph **in-memory only**: `run_graph_task` seeds a fresh state dict (with the `session_id` and empty collections) and invokes the graph once. Nothing is persisted between node executions, and there is no resume/replay capability.
- **Session isolation today** comes from two things that do not require a checkpointer: each request builds its own independent state object, and `session_id` is stored on the documents written (`external_conditions`, `supplier_risk_evaluations`) and used as a query filter. It does **not** come from LangGraph checkpoint namespacing.
- The `retrieve_memory` node referenced in an earlier version of this ADR's Consequences is **confirmed dead code** — it is not added to the compiled graph, so no per-session evaluation history is accessed through it. See `risk_evaluator/README.md`.

Realizing this ADR would require instantiating `MongoDBSaver`, passing it to `compile(checkpointer=...)`, and setting `thread_id = session_id` per invocation — none of which exists yet.

## Consequences

**Positive**
- Automatic state isolation per session — no custom partitioning logic needed.
- LangGraph's built-in replay and resume capabilities work out of the box per session.
- Cleanup is a single `deleteMany` query per collection.

> Note: an earlier version of this ADR listed contextual memory retrieval via
> `retrieve_memory` as a benefit. That node is confirmed dead code (not wired
> into the graph) — see "Current implementation status" above.

**Negative**
- `MongoDBSaver` uses the synchronous PyMongo client internally (as of langgraph-checkpoint-mongodb 0.x). This means checkpointer writes block the event loop unless wrapped in `run_in_executor`. Monitor the `langgraph-checkpoint-mongodb` package for an async Motor-compatible version.
- Long-running demo sessions accumulate checkpoint documents. Add a TTL index on the checkpoint collection for automatic expiry in demo environments.