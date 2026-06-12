"use client";

import { H3, Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

export default function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: spacing[400] }}>
      <H3>{title}</H3>
      {subtitle && (
        <Body style={{ color: palette.gray.dark1, marginTop: spacing[100], fontSize: 16 }}>
          {subtitle}
        </Body>
      )}
    </div>
  );
}
