"use client";

import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

/**
 * Renders a list of plain-English glossary definitions as structured data.
 *
 * `terms` is an array of { term, definition } objects (as produced by the backend's
 * get_definitions). Each entry is its own block with the term in real bold — no markdown
 * renderer and no whiteSpace: "pre-line" hack, since this is structured data rather than a
 * single run-together string. Renders nothing when the array is empty or missing.
 */
export default function GlossaryList({ terms }) {
  if (!Array.isArray(terms) || terms.length === 0) return null;

  return (
    <div style={{ marginTop: spacing[200] }}>
      {terms.map(({ term, definition }) => (
        <Body
          key={term}
          style={{
            fontSize: 13,
            color: palette.gray.dark2,
            marginBottom: spacing[100],
          }}
        >
          <strong>{term}</strong>: {definition}
        </Body>
      ))}
    </div>
  );
}
