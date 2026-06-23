import random
from datetime import datetime, timezone
from uuid import uuid4

from core.exceptions import SignalGenerationError

# DEMO SIMPLIFICATION: in production this comes from agent_memory Vector Search
# on (supplier_id, risk_type). Hardcoded neutral for demo — any memory Agent 1
# finds at runtime only improves the result.
HISTORICAL_WEIGHT_DEFAULT = 1.0

SAFETY_MARGIN = 1.15


async def generate_and_insert_signals(db, session_id: str, targets: list[dict]) -> list[dict]:
    """
    For each (supplier, risk) pair in targets:
    - Picks a random base signal from external_conditions matching the risk_catalog_ref.
    - Calculates condition_score using the RPN threshold formula with SAFETY_MARGIN.
    - Copies the base document, overrides the demo-specific fields, inserts all at once.
    Returns the inserted documents with _id removed.
    """
    docs = []

    for target in targets:
        risk = target["risk"]

        base_signals = await db["external_conditions"].find({
            "is_base": True,
            "risk_catalog_ref": risk["risk_id"],
        }).to_list(length=None)

        if not base_signals:
            raise SignalGenerationError(
                f"No base signal found for risk_catalog_ref={risk['risk_id']}"
            )

        base = random.choice(base_signals)

        condition_score = (
            risk["alert_threshold_rpn"]
            / (risk["severity"] * risk["occurrence_base"] * HISTORICAL_WEIGHT_DEFAULT * risk["detection"])
        ) * SAFETY_MARGIN

        doc = {k: v for k, v in base.items() if k != "_id"}
        doc["condition_score"] = condition_score
        doc["is_base"] = False
        doc["is_demo_trigger"] = True
        doc["session_id"] = session_id
        doc["condition_id"] = (
            f"COND-{session_id[:8].upper()}-"
            f"{risk['risk_type'][:3].upper()}-"
            f"{uuid4().hex[:6].upper()}"
        )
        doc["detected_at"] = datetime.now(timezone.utc)
        doc["valid_until"] = None

        docs.append(doc)

    await db["external_conditions"].insert_many(docs)

    return [{k: v for k, v in d.items() if k != "_id"} for d in docs]
