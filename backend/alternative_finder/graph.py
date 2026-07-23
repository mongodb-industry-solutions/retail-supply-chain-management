"""
Graph assembly and execution entry point for the alternative_finder agent.

A LangGraph ``StateGraph`` with four nodes, one per layer of the new design, wired in
strict sequence (linear, no conditional branches):

    START
      → plan_node             (layer 0) — Plan
      → funnel_node           (layer 1) — Deterministic Funnel
      → reflect_critique_node (layer 2) — Reflect & Critique
      → rank_assembly_node    (layer 3) — Close: proximity + ranking (deterministic)
      → summarize_node        (layer 3) — Close: per-candidate rationale (LLM)
      → persist_node          (layer 3) — Close: persist + shortlist_ready
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
    PlanResolutionError,
    _emit,
    funnel_node,
    persist_node,
    plan_node,
    rank_assembly_node,
    reflect_critique_node,
    summarize_node,
)
from alternative_finder.schemas import AlternativeFinderState

builder = StateGraph(AlternativeFinderState)

builder.add_node("plan_node", plan_node)
builder.add_node("funnel_node", funnel_node)
builder.add_node("reflect_critique_node", reflect_critique_node)
# Layer 3 (Close) is split into three nodes: deterministic rank-assembly, an LLM
# summariser that adds a per-candidate rationale, then the (unchanged) persist step.
builder.add_node("rank_assembly_node", rank_assembly_node)
builder.add_node("summarize_node", summarize_node)
builder.add_node("persist_node", persist_node)

builder.add_edge(START, "plan_node")
builder.add_edge("plan_node", "funnel_node")
builder.add_edge("funnel_node", "reflect_critique_node")
builder.add_edge("reflect_critique_node", "rank_assembly_node")
builder.add_edge("rank_assembly_node", "summarize_node")
builder.add_edge("summarize_node", "persist_node")
builder.add_edge("persist_node", END)

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

    Per the corrected contract, ``alternative_finder_started`` carries only what is known
    at request time (``evaluation_id_ref``). ``supplier_id`` and ``risk_types`` are NOT
    included here — they are read server-side from the referenced
    ``supplier_risk_evaluations`` document inside ``plan_node`` (Layer 0) and surface for
    the first time on Layer 0's ``layer_completed`` event.

    If ``plan_node`` cannot resolve ``evaluation_id_ref`` to a real document it emits its
    own ``error`` event and raises ``PlanResolutionError``; we catch that here and emit
    only ``stream_end`` (status ``failed``) so the error is not duplicated. Any other
    unhandled exception still gets a generic ``error`` + ``stream_end`` failed.
    """
    try:
        await _emit(
            config, session_id, "alternative_finder_started",
            evaluation_id_ref=evaluation_id_ref,
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
    except PlanResolutionError:
        # plan_node already emitted the contract error event; just close the stream.
        await _emit(config, session_id, "stream_end", status="failed")
    except Exception as e:
        await _emit(config, session_id, "error", message=str(e), recoverable=False)
        await _emit(config, session_id, "stream_end", status="failed")
    finally:
        await queue.put(None)
