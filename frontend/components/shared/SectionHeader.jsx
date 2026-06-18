"use client";

import { H3, Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

export default function SectionHeader({ title, subtitle, badge, rightElement }) {
  return (
    <div
      className="d-flex align-items-start justify-content-between"
      style={{ width: "100%", marginBottom: spacing[400] }}
    >
      <div>
        <div className="d-flex align-items-center gap-2" style={{ marginBottom: spacing[100] }}>
          <H3 style={{ margin: 0 }}>{title}</H3>
          {badge}
        </div>
        {subtitle && (
          <Body style={{ color: palette.gray.dark1, fontSize: 16 }}>
            {subtitle}
          </Body>
        )}
      </div>
      {rightElement && (
        <div style={{ flexShrink: 0, marginLeft: spacing[400] }}>{rightElement}</div>
      )}
    </div>
  );
}
