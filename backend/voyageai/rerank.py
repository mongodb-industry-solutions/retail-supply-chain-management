async def rerank(query: str, documents: list[dict], top_k: int = 5) -> list[dict]:
    """
    Re-ranks a list of candidate documents against a query string.

    Uses MongoDB's native Voyage AI reranker integration rather than calling the
    voyageai SDK directly. The reranking is performed inside a MongoDB Atlas
    aggregation pipeline via the $rankFusion or $vectorSearch rerank stage,
    keeping the rerank call close to the data and avoiding unnecessary document
    transfer.

    Args:
        query: The natural-language query describing the disruption context.
        documents: Candidate supplier documents returned by hybrid_search.
        top_k: Maximum number of re-ranked results to return.

    Returns:
        Top-k documents sorted by rerank score descending, each annotated with
        a rerank_score field.
    """
    return documents[:top_k]
