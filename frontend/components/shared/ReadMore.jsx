"use client";

import { useState } from "react";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

export default function ReadMore({
  text,
  lineClamp = 1,
  weight,
  style,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  return (
    <div style={{ marginBottom: spacing[100] }}>
      <Body
        weight={weight}
        style={{
          fontSize: 14,
          color: palette.gray.dark2,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? "unset" : lineClamp,
          ...style,
        }}
      >
        {text}
      </Body>
      <span
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        style={{
          fontSize: 13,
          color: palette.blue.base,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {expanded ? "Read less" : "Read more"}
      </span>
    </div>
  );
}
