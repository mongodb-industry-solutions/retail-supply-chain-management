async def select_target(session_id: str) -> dict:
    """
    Deterministically selects a target supplier and alert_type for the simulation.

    Uses a hash of the session_id to pick from a predefined list of suppliers and
    alert types, ensuring controlled variability across sessions without randomness
    that could break the demo flow.

    Returns a dict with keys: supplier_id, supplier_name, alert_type, alert_threshold_rpn.
    """
    return {}
