# NOT USED IN THE DEMO.
# This module documents the production activation model for the risk evaluator.
# In production, this would replace the HTTP endpoint in router.py: the risk evaluator
# would wake up automatically when new disruption signals are written, without any
# direct call from the frontend or ingestion engine.
# Reference: ADR 003 (adrs/003-sse-change-stream.md)


async def watch_external_conditions(session_id: str):
    """
    Production activation model — not used in the demo.

    Opens a MongoDB Change Stream on the external_conditions collection and listens
    for insert events where is_demo_trigger=True and session_id matches the provided
    session_id. On match, triggers the risk evaluator LangGraph graph for the affected
    supplier and condition, streaming results to the frontend via SSE.

    In the demo, the same flow is triggered by an explicit POST /api/simulation/evaluate
    from the frontend after ingestion completes (see router.py).
    """
    pass
