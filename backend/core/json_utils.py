"""Shared JSON parsing helpers used across backend slices.

Lives in ``core`` so slices (ingestion_engine, risk_evaluator, alternative_finder)
can reuse it without importing from one another (ADR 005).
"""

import json
import re


def _extract_json(text: str) -> dict:
    """Parse the first JSON object out of an LLM response, tolerating ```json fences.

    Mirrors risk_evaluator's Final-Answer parsing approach (regex + json.loads) since no
    ``with_structured_output`` pattern exists anywhere in this codebase to match.
    """
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = brace.group(0) if brace else text
    return json.loads(candidate)
