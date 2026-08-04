/**
 * Frontend copy of the backend glossary (backend/core/glossary.py).
 *
 * The agents don't always return every term they use, so these defaults act as
 * the fallback: `getGlossaryDefinition` prefers whatever the backend sent and
 * falls back to the definition here when the term is missing.
 */
export const GLOSSARY = {
  // --- SHARED ---
  precedent:
    "Shorthand for 'this has happened before' — covers both an exact past case and a similar one used for comparison.",

  // --- RISK_EVALUATOR ---
  RPN: "A single score combining how severe a problem would be, how likely it is to happen, and how hard it is to detect in time. The higher it is, the more urgent.",
  historical_weight:
    "An adjustment to the risk score based on how this specific supplier has actually performed in similar situations before — not a generic assumption, its own track record.",
  condition_score:
    "How strongly an active real-world signal (a news report, a weather alert) is affecting the situation right now.",

  // --- ALTERNATIVE_FINDER ---
  compliance_certification:
    "Whether the supplier's required certifications and paperwork are on file and currently valid.",
  operational_status:
    "Whether the supplier has real, available capacity right now and no active disruption — the current situation, not just what's on paper.",
  sustainability_practices:
    "Whether the supplier meets the required environmental and ethical sourcing standards on file.",
  evidence_coverage:
    "How many of the required checks for this supplier were actually backed by a real document, versus left unconfirmed.",
  criteria_verified:
    "The number of required checks that were actually confirmed with a real document, out of the total checked.",
  proximity_km:
    "How close the supplier is to where the product needs to be delivered — used to choose between already-valid candidates, never to disqualify one.",
  exact_track_record:
    "A documented past case with this exact alternative supplier, under this exact type of risk.",
  semantic_precedent:
    "How similar situations played out elsewhere — a different supplier, a different region — used when there's no exact past case for this supplier.",
};

/**
 * Definition for `term`, preferring the backend-provided glossary array
 * (`[{ term, definition }]`) and falling back to the static GLOSSARY.
 * Returns null when neither has the term.
 */
export function getGlossaryDefinition(glossary, term) {
  if (!term) return null;
  const fromBackend = Array.isArray(glossary)
    ? glossary.find((entry) => entry?.term === term)?.definition
    : null;
  return fromBackend || GLOSSARY[term] || null;
}
