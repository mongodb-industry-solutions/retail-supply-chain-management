"""
Graph assembly and execution entry point for the alternative_finder agent.

A LangGraph ``StateGraph`` with four nodes, one per layer of the new design, wired in
strict sequence (linear, no conditional branches):

    START
      → plan_node             (layer 0) — Plan
      → funnel_node           (layer 1) — Deterministic Funnel
      → reflect_critique_node (layer 2) — Reflect & Critique
      → close_node            (layer 3) — Close
    END

Same conveyor-belt bridge as ``risk_evaluator``: the FastAPI router creates an
``asyncio.Queue``, schedules ``run_graph_task`` via ``asyncio.create_task``, and drains
the queue as SSE frames. Nodes read the queue from ``config["configurable"]["queue"]``
and push contract events onto it.

Unlike risk_evaluator, this stream has an explicit terminal event: ``run_graph_task``
emits ``alternative_finder_started`` before invoking the graph and ``stream_end``
(status ``completed`` / ``failed``) after — replacing the undocumented ``None``
sentinel as the *contract* terminator. A ``None`` is still placed on the queue *after*
``stream_end`` purely to break the router's read loop.

Stage 4.0 is plumbing only: real graph, real state transitions, real event shapes,
placeholder data. No Mongo, LLM, or vector/geo/rank calls yet.
"""

import asyncio

from langgraph.graph import END, START, StateGraph

from alternative_finder.nodes import (
    _emit,
    close_node,
    funnel_node,
    plan_node,
    reflect_critique_node,
)
from alternative_finder.schemas import AlternativeFinderState

builder = StateGraph(AlternativeFinderState)

builder.add_node("plan_node", plan_node)
builder.add_node("funnel_node", funnel_node)
builder.add_node("reflect_critique_node", reflect_critique_node)
builder.add_node("close_node", close_node)

builder.add_edge(START, "plan_node")
builder.add_edge("plan_node", "funnel_node")
builder.add_edge("funnel_node", "reflect_critique_node")
builder.add_edge("reflect_critique_node", "close_node")
builder.add_edge("close_node", END)

graph = builder.compile()


async def run_graph_task(
    session_id: str, evaluation_id_ref: str, queue: asyncio.Queue, config: dict
) -> None:
    """Invoke the alternative_finder graph as a background coroutine and frame the stream.

    Emits ``alternative_finder_started`` up front, runs the four-layer graph (each node
    streaming its own layer events), then emits the terminal ``stream_end``. On any
    unhandled exception, emits an ``error`` event followed by ``stream_end`` with
    ``status: "failed"`` so the stream always closes cleanly. A final ``None`` breaks
    the router's queue loop.

    NOTE (Stage 4.0): ``supplier_id`` and ``risk_types`` on ``alternative_finder_started``
    are placeholders here. Per the contract they are read server-side from the referenced
    ``supplier_risk_evaluations`` document — that read lands in plan_node in Stage 4.1,
    at which point the started event should be emitted with the real values. See the
    ambiguity note in the stage summary.
    """
    try:
        await _emit(
            config, session_id, "alternative_finder_started",
            evaluation_id_ref=evaluation_id_ref,
            supplier_id="SUP-PLACEHOLDER-000",
            risk_types=["PLACEHOLDER_RISK_TYPE"],
        )
        await graph.ainvoke(
            {
                "session_id": session_id,
                "evaluation_id_ref": evaluation_id_ref,
                "supplier_id": "",
                "risk_types": [],
                "region_exclude": [],
                "doc_type_hint": [],
                "profile_text": "",
                "candidates": [],
                "audits": {},
                "proximity_km": {},
                "shortlist": [],
                "approved_supplier_id": None,
                "agent_thoughts": [],
                "atlas_operations": [],
            },
            config,
        )
        await _emit(config, session_id, "stream_end", status="completed")
    except Exception as e:
        await _emit(config, session_id, "error", message=str(e), recoverable=False)
        await _emit(config, session_id, "stream_end", status="failed")
    finally:
        await queue.put(None)
