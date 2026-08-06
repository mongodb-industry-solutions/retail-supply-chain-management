"""
Graph assembly and execution entry point for the risk evaluator agent.

A LangGraph ``StateGraph`` is a directed graph where each node is a Python function and
each edge defines which node runs next.  ``builder.add_edge(A, B)`` means "after A
finishes, run B"; ``START`` and ``END`` are special sentinels that mark the entry and
exit of the graph.  Calling ``builder.compile()`` validates the graph structure and
returns an executable object — ``graph`` — with methods like ``ainvoke`` that run the
whole pipeline asynchronously.

This graph is compiled *without* a checkpointer, which means it is stateless between
runs: every call to ``ainvoke`` starts with a fresh, empty state and nothing is persisted
to disk or a database by LangGraph itself.  In production the graph would be triggered
automatically by a MongoDB Change Stream (see ``stream_listener.py`` and ADR 003 —
docs/adr/003-backend-sse-change-stream.md) rather
than an HTTP call, and a checkpointer might be added to support pause-and-resume for
long-running evaluations.

``run_graph_task`` is the bridge between FastAPI's async world and the graph.  FastAPI's
router cannot ``await`` the graph directly inside the SSE generator without blocking the
event loop for the duration of the run, so instead the router schedules
``run_graph_task`` as a background coroutine via ``asyncio.create_task``.  The two sides
communicate through an ``asyncio.Queue``: the graph writes events (progress, results,
errors) onto the queue; the router reads from it and forwards each event as an SSE
message.  A ``None`` sentinel placed on the queue by the last node signals that the graph
has finished and the router should close the stream.
"""

import asyncio

from langgraph.graph import END, START, StateGraph

from risk_evaluator.nodes import (
    calculate_rpn,
    detect_conditions,
    generate_summary,
    match_suppliers,
    reason_and_retrieve,
)
from risk_evaluator.schemas import RiskEvaluatorState

builder = StateGraph(RiskEvaluatorState)

builder.add_node("detect_conditions", detect_conditions)
builder.add_node("match_suppliers", match_suppliers)
builder.add_node("calculate_rpn", calculate_rpn)
builder.add_node("reason_and_retrieve", reason_and_retrieve)
builder.add_node("generate_summary", generate_summary)

# Pipeline sequence (linear — no conditional branches):
#   START
#     → detect_conditions   : Atlas Query      — find active signals for this session
#     → match_suppliers     : Atlas Geospatial / Query — find exposed suppliers
#     → calculate_rpn       : Atlas Query      — score each supplier–signal pair
#     → reason_and_retrieve : LLM ReAct loop   — query Atlas memory, derive weights
#     → generate_summary    : LLM + write      — narrate risk and persist results
#   END
builder.add_edge(START, "detect_conditions")
builder.add_edge("detect_conditions", "match_suppliers")
builder.add_edge("match_suppliers", "calculate_rpn")
builder.add_edge("calculate_rpn", "reason_and_retrieve")
builder.add_edge("reason_and_retrieve", "generate_summary")
builder.add_edge("generate_summary", END)

graph = builder.compile()


async def run_graph_task(session_id: str, queue: asyncio.Queue, config: dict) -> None:
    """Invoke the risk evaluator graph as a background coroutine and relay errors to SSE.

    Called by the FastAPI router via ``asyncio.create_task`` so it runs concurrently
    with the SSE generator that drains the queue — the two coroutines communicate
    through ``queue`` without blocking each other.

    Initialises the LangGraph state with empty collections for each field; nodes
    accumulate data into those fields as the pipeline progresses, with each node
    returning only the keys it modifies (LangGraph merges partial updates back into
    the shared state dict automatically).

    On any unhandled exception, puts an ``{"type": "error", ...}`` frame followed by
    ``None`` onto the queue so the SSE stream closes cleanly instead of hanging open
    while the client waits for more events that will never arrive.
    """
    try:
        await graph.ainvoke(
            {
                "session_id": session_id,
                "conditions": [],
                "exposed_suppliers": {},
                "risk_scores": {},
                "memory_episodes": {},
                "evaluations": [],
                "agent_thoughts": [],
                "atlas_operations": [],
            },
            config,
        )
    except Exception as e:
        await queue.put({"type": "error", "message": str(e)})
        await queue.put(None)
