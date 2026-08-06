"use client";

import Image from "next/image";
import { ExpandableCard } from "@leafygreen-ui/expandable-card";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

export const bodyStyle = { color: palette.gray.dark2, fontSize: 15 };

export const bulletListStyle = {
  margin: `${spacing[200]}px 0`,
  paddingLeft: spacing[600],
};

export function Mono({ children }) {
  return (
    <code
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: "0.9em",
        color: palette.green.dark2,
      }}
    >
      {children}
    </code>
  );
}

export function Lead({ children }) {
  return (
    <strong style={{ color: palette.gray.dark3, fontWeight: 700 }}>
      {children}
    </strong>
  );
}

export default function BehindTheScenesCard({
  title,
  description,
  diagramSrc,
  diagramAlt,
  children,
}) {
  return (
    <ExpandableCard
      title={title}
      description={description}
      defaultOpen={false}
      style={{ marginBottom: spacing[400] }}
    >
      <div style={{ padding: `${spacing[200]}px 0` }}>
        {/* Architecture diagram */}
        <Image
          src={diagramSrc}
          alt={diagramAlt}
          width={960}
          height={540}
          style={{
            width: "100%",
            height: "auto",
            borderRadius: 10,
            border: `1px solid ${palette.gray.light2}`,
            marginBottom: spacing[400],
          }}
        />

        {children}
      </div>
    </ExpandableCard>
  );
}
