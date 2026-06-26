"""
FastAPI router that triggers the risk evaluator agent and streams its output as SSE.

This endpoint returns a Server-Sent Events stream rather than a plain JSON response
because the agent takes several seconds to complete — five sequential nodes, each
hitting MongoDB, with a final LLM call.  SSE lets the frontend display live progress
(which node is running, when it finishes) rather than showing a spinner for the full
duration and receiving one large payload at the end.

The communication pattern works like a conveyor belt: the router creates an
``asyncio.Queue``, packages it into the LangGraph ``config`` dict under
``config["configurable"]["queue"]``, and schedules the graph as a background task via
``asyncio.create_task``.  Each node inside the graph reads the queue out of ``config``
and writes ``tool_start`` / ``tool_end`` events as it begins and completes its work.
The ``event_generator`` coroutine in the router simply loops on ``queue.get()`` and
yields each event as an SSE data frame — no polling, no timeouts, just natural async
back-pressure.

The loop ends when the graph places a ``None`` sentinel on the queue, which is the
agreed signal that all nodes have finished and the stream can be closed.  This sentinel
is written by the last node (``generate_summary``) after it has put the final
``agent_response`` event on the queue.

This design embodies the human-in-the-loop principle: the procurement manager watching
the frontend sees each reasoning step — signal detection, supplier matching, RPN
calculation, memory retrieval, summary generation — as it happens, and can understand
how the agent reached its conclusion before the final risk assessment arrives.  The
``tool_start`` / ``tool_end`` events make the agent's internal process auditable in real
time, not just as a black-box result.
"""

import asyncio
import json

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from core.session import get_session_id
from risk_evaluator.graph import run_graph_task

router = APIRouter(prefix="/api/simulation", tags=["risk_evaluator"])


@router.post("/evaluate")
async def evaluate(session_id: str = Depends(get_session_id)):
    """
    Triggers the risk evaluator graph for the given session and streams
    progress and results back to the client as Server-Sent Events.
    """
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        config = {"configurable": {"session_id": session_id, "queue": queue}}
        asyncio.create_task(run_graph_task(session_id, queue, config))
        while True:
            event = await queue.get()
            if event is None:
                break
            yield {"data": json.dumps(event, default=str)}

    return EventSourceResponse(event_generator())
