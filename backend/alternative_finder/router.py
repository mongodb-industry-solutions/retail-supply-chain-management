"""
FastAPI router for the alternative_finder agent — triggers the graph and streams its
output as Server-Sent Events.

Same conveyor-belt pattern as ``risk_evaluator/router.py``: create an ``asyncio.Queue``,
hand it to the graph via ``config["configurable"]["queue"]``, schedule the graph as a
background task, and yield each queued event as an SSE frame. The graph places a
``None`` sentinel on the queue *after* the contract's terminal ``stream_end`` event, and
that sentinel breaks the read loop and lets the stream close.

``X-Session-ID`` is required (400 if missing) via ``get_session_id``, consistent with
the rest of the system. The body carries a single ``evaluation_id_ref``; everything else
(supplier_id, risk_types, operational context) is read server-side from the referenced
``supplier_risk_evaluations`` document in later stages.
"""

import asyncio
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from core.session import get_session_id
from alternative_finder.graph import run_graph_task

router = APIRouter(prefix="/api/alternative-finder", tags=["alternative_finder"])


class FindAlternativesRequest(BaseModel):
    evaluation_id_ref: str


@router.post("/find")
async def find(
    body: FindAlternativesRequest,
    session_id: str = Depends(get_session_id),
):
    """Trigger the alternative_finder graph and stream progress as Server-Sent Events.

    The queue decouples the background graph (producer) from this generator (consumer)
    with natural async back-pressure. ``json.dumps(..., default=str)`` guards against any
    non-serialisable values slipping into an event payload.
    """
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        config = {"configurable": {"session_id": session_id, "queue": queue}}
        asyncio.create_task(
            run_graph_task(session_id, body.evaluation_id_ref, queue, config)
        )
        while True:
            event = await queue.get()
            if event is None:
                break
            yield {"data": json.dumps(event, default=str)}

    return EventSourceResponse(event_generator())
