async def generate_signals(session_id: str, alert_type: str) -> list[dict]:
    """
    Generates 3 demo trigger documents, one per risk_type (geopolitical, weather, logistics).

    Each document is crafted so its condition_score is high enough to guarantee that the
    calculated RPN (Risk Priority Number) breaches the alert_threshold_rpn for the target
    supplier identified by select_target(). Documents include is_demo_trigger=True and
    the given session_id for Change Stream filtering.
    """
    return []
