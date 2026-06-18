"use client";

import ExpandableCard from "@leafygreen-ui/expandable-card";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

export default function HowExternalConditionsGenerated() {
  return (
    <ExpandableCard
      title="How External Conditions Are Generated"
      description="Multi-agent architecture for real-time risk detection"
      defaultOpen={false}
      style={{ marginBottom: spacing[400] }}
    >
      <div style={{ padding: `${spacing[200]}px 0` }}>
        <Body weight="medium" style={{ color: palette.gray.dark2, marginBottom: spacing[100] }}>
          Content To Be Determined
        </Body>
        <Body style={{ color: palette.gray.base }}>Queries, results, etc…</Body>
      </div>
    </ExpandableCard>
  );
}
