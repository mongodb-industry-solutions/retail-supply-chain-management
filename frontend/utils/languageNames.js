// BCP-47 language tag -> English display name.
//
// The corpus in `supplier_documents` carries 17 distinct tags today (en, es-MX, es-CO,
// es-PE, es-ES, zh-Hans, zh-Hant, vi, ar, nl, de, pt-BR, ja, th, pl, it, fr-CA), and that
// list grows whenever a document is added. So we resolve names with Intl.DisplayNames
// rather than hand-maintaining a table that would silently fall behind the data.

// Tags Intl renders in a way that reads poorly in this UI. Script subtags are the main
// case: Intl gives "Chinese (Simplified Han)", which is correct but not what a sourcing
// analyst expects to read next to a certificate.
const OVERRIDES = {
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
};

let displayNames;
try {
  // languageDisplay: "standard" gives "Spanish (Mexico)" rather than the default
  // "dialect" form "Mexican Spanish" — the base language stays the first thing read,
  // which is what matters when scanning a column of these.
  displayNames = new Intl.DisplayNames(["en"], {
    type: "language",
    languageDisplay: "standard",
  });
} catch {
  // Intl.DisplayNames is unavailable — fall through to returning the raw tag.
  displayNames = null;
}

/**
 * Resolve a BCP-47 tag to an English language name, e.g. "es-MX" -> "Spanish (Mexico)".
 *
 * Returns null for a missing/blank tag, so callers can render nothing at all rather than
 * a placeholder: citations persisted before `language` was added to the citation contract
 * legitimately have no tag, and inventing "Unknown" for them would read as a data problem.
 * Falls back to the raw tag if it cannot be resolved — showing "qq-XX" is more honest than
 * hiding evidence metadata we do have.
 */
export function languageName(tag) {
  if (!tag || typeof tag !== "string" || !tag.trim()) return null;
  const clean = tag.trim();
  if (OVERRIDES[clean]) return OVERRIDES[clean];
  if (!displayNames) return clean;
  try {
    return displayNames.of(clean) ?? clean;
  } catch {
    // Malformed tag — Intl throws on structurally invalid input.
    return clean;
  }
}
