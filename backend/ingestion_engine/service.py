from typing import AsyncGenerator


async def run_simulation(session_id: str) -> AsyncGenerator[str, None]:
    """
    Orchestrates the ingestion simulation for a given session.

    Generates 3 external_condition documents (one per risk_type), inserts them
    into the external_conditions MongoDB collection with is_demo_trigger=True and
    the given session_id, then yields SSE-formatted progress events to the frontend.
    """
    yield "data: {\"event\": \"simulation_started\"}\n\n"
