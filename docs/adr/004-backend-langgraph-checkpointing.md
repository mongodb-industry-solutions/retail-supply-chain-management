# ADR 004 — Session Isolation: Why This Demo Doesn't Use a LangGraph Checkpointer

## Status
Accepted. This demo isolates sessions without a checkpointer, using the simpler approach described below. The checkpointer-based design is documented here as a reference for what a production, multi-turn version of this system would look like — not as a pending task for this repo.

## What actually happens today

This is a multi-user demo — several Solutions Architects can run it at the same time, each in their own browser session, and one person's run must never leak into another's.

Session isolation today comes from two things, neither of which involves LangGraph's checkpointer:

1. **Each request builds its own in-memory state.** `run_graph_task` seeds a fresh state dict (with the request's `session_id` and empty collections) and invokes the graph once. Nothing is persisted between node executions — there's no resume and no replay.
2. **`session_id` is stored as a field on every document written** (`external_conditions`, `supplier_risk_evaluations`) and used as a query filter downstream. Isolation happens at the data layer, via filtering — not via graph-level namespacing.

Both `risk_evaluator/graph.py` and `alternative_finder/graph.py` call `builder.compile()` with no `checkpointer` argument. `MongoDBSaver` is not instantiated anywhere in the codebase.

This works correctly for the demo's needs: each session gets isolated state, and cleanup is simple. What it does **not** give you is state persistence across turns, or the ability to pause/resume a graph mid-execution — because the state only exists for the lifetime of a single request.

## Why we didn't use LangGraph's checkpointer for this demo

LangGraph supports built-in persistence and isolation via a checkpointer (e.g. `MongoDBSaver`, keyed by `thread_id`). We considered it, but it solves a problem this demo doesn't have: **multi-turn conversations that need to resume or replay**. Each demo run is a single, self-contained graph execution — there's no "come back later and continue where you left off" requirement, so the added complexity (a synchronous Mongo client that can block the event loop, checkpoint documents that accumulate over time) wasn't worth it here.

In short: the request-scoped in-memory state + `session_id` filtering is simpler, sufficient for this use case, and has fewer moving parts to explain in a demo setting.

## When a checkpointer would make sense (outside the scope of this demo)

This section is a reference, not a roadmap item — it describes what would change if this project moved beyond a single-run demo into something with persistent, multi-turn state. Relevant if the project evolved toward:
- **Multi-turn interactions** where a user needs to pause a graph run and resume it later (e.g. a long-running evaluation that spans multiple user actions).
- **Replay/debugging** — inspecting or re-running a specific past graph execution step by step.
- **True session persistence** across backend restarts, not just across nodes within a single request.

If that ever applies, here's the shape of the change:

```python
from langgraph.checkpoint.mongodb import MongoDBSaver

checkpointer = MongoDBSaver(db)
graph = compiled_graph.with_config({"configurable": {"thread_id": session_id}})
```

`thread_id` becomes the isolation key LangGraph uses internally — every checkpointed state write gets namespaced under it — and session reset becomes a single `deleteMany` on the checkpoint collection where `thread_id = session_id`, alongside the existing cleanup of `external_conditions`.

**Known tradeoffs to plan for if this gets built:**
- `MongoDBSaver` uses the synchronous PyMongo client internally (as of `langgraph-checkpoint-mongodb` 0.x) — checkpointer writes would block the event loop unless wrapped in `run_in_executor`. Watch this package for an async, Motor-compatible version.
- Long-running sessions accumulate checkpoint documents — a TTL index on the checkpoint collection would be needed for automatic expiry.