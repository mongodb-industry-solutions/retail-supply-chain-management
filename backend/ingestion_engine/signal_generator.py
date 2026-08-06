import logging
import random
from datetime import datetime, timezone
from uuid import uuid4

from core.exceptions import SignalGenerationError

logger = logging.getLogger(__name__)

# Neutral fallback used when no relevant historical episode exists in agent_memory.
# When episodes DO exist, _worst_case_historical_weight derives a real worst-case
# weight from them (see below) instead of assuming neutral.
HISTORICAL_WEIGHT_DEFAULT = 1.0

SAFETY_MARGIN = 1.15

# Deterministic per-episode weight rule (no LLM, no reasoning loop). Mirrors the
# occurred-based rule already used in risk_evaluator.retrieve_memory: an episode whose
# past impact actually occurred amplifies risk (1.20); one that did not attenuates it
# (0.90). ingestion takes the MINIMUM across matching episodes so condition_score is
# sized for the worst case the evaluator might later apply, keeping rpn_dynamic above
# alert_threshold_rpn even when the evaluator applies an attenuating weight.
#
# The final result is clamped with min(1.0, ...): the worst-case weight may only WIDEN
# the safety margin (an attenuating episode, <1.0), never NARROW it. An amplifying
# episode (>1.0) would otherwise shrink condition_score and make the ALERT guarantee
# depend on the evaluator re-applying that amplification at runtime — the opposite of
# protecting the worst case. So amplifiers clamp back to neutral 1.0.
_OCCURRED_WEIGHT = 1.20
_NOT_OCCURRED_WEIGHT = 0.90


async def _worst_case_historical_weight(db, risk_type: str) -> float:
    """Return the worst-case (minimum) historical_weight for a risk_type from agent_memory.

    Deterministic read-only query (find, not vector search) filtered cross-supplier by
    risk_type only — the same cross-supplier criterion search_combined_episodes uses in
    risk_evaluator. For each matching episode the weight is derived from
    episode.actual_impact.occurred (1.20 if True, 0.90 if False). Episodes missing the
    occurred flag are excluded from the calculation entirely. If no episode matches (or
    none carries occurred), returns HISTORICAL_WEIGHT_DEFAULT (1.0), the pre-existing
    neutral behaviour.

    The minimum is clamped with min(1.0, ...) so it can only widen the margin
    (attenuating episodes), never narrow it (amplifying episodes clamp back to 1.0).
    """
    episodes = await db["agent_memory"].find({"risk_type": risk_type}).to_list(length=None)
    weights = []
    for ep in episodes:
        impact = ep.get("episode", {}).get("actual_impact", {})
        if "occurred" not in impact:
            continue
        weights.append(_OCCURRED_WEIGHT if impact["occurred"] else _NOT_OCCURRED_WEIGHT)
    if not weights:
        return HISTORICAL_WEIGHT_DEFAULT
    return min(1.0, min(weights))


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

        worst_case_weight = await _worst_case_historical_weight(db, risk["risk_type"])

        condition_score = (
            risk["alert_threshold_rpn"]
            / (risk["severity"] * risk["occurrence_base"] * worst_case_weight * risk["detection"])
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
        logger.info(
            "[%s] condition_id=%s  risk_catalog_ref=%s  risk_type=%s",
            session_id,
            doc["condition_id"],
            doc.get("risk_catalog_ref", "?"),
            doc.get("risk_type_triggered", "?"),
        )
        doc["detected_at"] = datetime.now(timezone.utc)
        doc["valid_until"] = None

        docs.append(doc)

    await db["external_conditions"].insert_many(docs)

    return [{k: v for k, v in d.items() if k != "_id"} for d in docs]
