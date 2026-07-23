"""Shared plain-English glossary for demo/risk-management vocabulary.

Single source of truth for the term definitions surfaced to end users in both
the risk_evaluator risk narratives and the alternative_finder rationales. The
LLM only ever selects which canonical keys apply; definition wording always
comes from here, verbatim, via :func:`get_definitions`.
"""

GLOSSARY: dict[str, str] = {
    # --- SHARED ---
    "precedent": (
        "Shorthand for 'this has happened before' — covers both an exact "
        "past case and a similar one used for comparison."
    ),

    # --- RISK_EVALUATOR ---
    "RPN": (
        "A single score combining how severe a problem would be, how "
        "likely it is to happen, and how hard it is to detect in time. "
        "The higher it is, the more urgent."
    ),
    "historical_weight": (
        "An adjustment to the risk score based on how this specific "
        "supplier has actually performed in similar situations before — "
        "not a generic assumption, its own track record."
    ),
    "condition_score": (
        "How strongly an active real-world signal (a news report, a "
        "weather alert) is affecting the situation right now."
    ),

    # --- ALTERNATIVE_FINDER ---
    "compliance_certification": (
        "Whether the supplier's required certifications and paperwork "
        "are on file and currently valid."
    ),
    "operational_status": (
        "Whether the supplier has real, available capacity right now and "
        "no active disruption — the current situation, not just what's "
        "on paper."
    ),
    "sustainability_practices": (
        "Whether the supplier meets the required environmental and "
        "ethical sourcing standards on file."
    ),
    "evidence_coverage": (
        "How many of the required checks for this supplier were actually "
        "backed by a real document, versus left unconfirmed."
    ),
    "criteria_verified": (
        "The number of required checks that were actually confirmed with "
        "a real document, out of the total checked."
    ),
    "proximity_km": (
        "How close the supplier is to where the product needs to be "
        "delivered — used to choose between already-valid candidates, "
        "never to disqualify one."
    ),
    "exact_track_record": (
        "A documented past case with this exact alternative supplier, "
        "under this exact type of risk."
    ),
    "semantic_precedent": (
        "How similar situations played out elsewhere — a different "
        "supplier, a different region — used when there's no exact past "
        "case for this supplier."
    ),
}

# Term-name subsets, in glossary declaration order, for each agent's footer.
SHARED_TERMS: list[str] = ["precedent"]
RISK_EVALUATOR_TERMS: list[str] = ["RPN", "historical_weight", "condition_score"]
ALTERNATIVE_FINDER_TERMS: list[str] = [
    "compliance_certification",
    "operational_status",
    "sustainability_practices",
    "evidence_coverage",
    "criteria_verified",
    "proximity_km",
    "exact_track_record",
    "semantic_precedent",
]


def get_definitions(terms: list[str]) -> list[tuple[str, str]]:
    """Look up ``terms`` in :data:`GLOSSARY`, returning ``(term, definition)`` pairs.

    Terms not present in the glossary are silently dropped — a defensive guard
    against a model reporting a term outside the fixed list. Never raises, never
    fabricates a definition. Results preserve the input order and are
    de-duplicated (first occurrence wins).
    """
    seen: set[str] = set()
    pairs: list[tuple[str, str]] = []
    for term in terms:
        if term in seen:
            continue
        definition = GLOSSARY.get(term)
        if definition is None:
            continue
        seen.add(term)
        pairs.append((term, definition))
    return pairs
