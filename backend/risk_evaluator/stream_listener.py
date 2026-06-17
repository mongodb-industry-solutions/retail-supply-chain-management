async def watch_external_conditions(session_id: str):
    """
    Opens a MongoDB Change Stream on the external_conditions collection.

    Listens for insert events where is_demo_trigger=True and session_id matches
    the provided session_id. On match, triggers the risk evaluator LangGraph
    execution for the affected supplier and condition.
    """
    pass
