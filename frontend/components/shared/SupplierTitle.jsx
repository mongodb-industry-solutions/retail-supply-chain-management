"use client";

import Icon from "@leafygreen-ui/icon";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

export default function SupplierTitle({ name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: palette.gray.base,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon glyph="Building" size="large" style={{ color: palette.white }} />
      </div>
      <Body
        weight="medium"
        style={{
          fontSize: 16,
          color: palette.gray.dark3,
          marginBottom: spacing[100],
        }}
      >
        {name}
      </Body>
    </div>
  );
}
