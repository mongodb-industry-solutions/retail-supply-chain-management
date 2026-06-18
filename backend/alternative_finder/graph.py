from typing import AsyncGenerator


# LangGraph StateGraph for alternative supplier discovery.
# Nodes (defined in nodes.py):
#   hybrid_search           — MongoDB Atlas vector + full-text search for candidate suppliers
#   voyage_rerank           — re-ranks candidates using Voyage AI reranker
#   validate_certifications — filters candidates that lack required compliance certifications
#   validate_lead_time      — filters candidates whose lead time exceeds acceptable threshold
#   validate_capacity       — filters candidates that cannot meet required order volume


async def run_alternative_finder(
    session_id: str, supplier_id: str, condition_id: str
) -> AsyncGenerator[str, None]:
    """
    Entry point for the alternative finder graph. Initialises state and streams
    SSE events as each node completes.
    """
    yield "data: {\"event\": \"alternative_finder_started\"}\n\n"
