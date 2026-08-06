from core.db import get_database
from ingestion_engine.signal_generator import generate_and_insert_signals
from ingestion_engine.target_selector import select_targets


async def run_ingestion(session_id: str) -> dict:
    """
    Orchestrates the ingestion simulation for a given session.

    Selects up to 3 (supplier, risk) pairs from live DB data, generates and inserts
    one demo trigger document per pair into external_conditions, and returns the
    inserted documents as a plain dict.
    """
    db = await get_database()
    targets = await select_targets(db)
    if not targets:
        return {"session_id": session_id, "signals": []}
    signals = await generate_and_insert_signals(db, session_id, targets)
    return {"session_id": session_id, "signals": signals}
