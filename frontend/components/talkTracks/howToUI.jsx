"use client";

import Image from "next/image";
import { Body, H3 } from "@leafygreen-ui/typography";
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

export function SectionTitle({ children }) {
  return (
    <H3
      style={{
        marginTop: spacing[500],
        marginBottom: spacing[200],
      }}
    >
      {children}
    </H3>
  );
}

/* What to say while the presenter is on screen — not a UI instruction */
export function SayThis({ children }) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${palette.green.base}`,
        background: palette.green.light3,
        borderRadius: 6,
        padding: `${spacing[200]}px ${spacing[300]}px`,
        margin: `${spacing[200]}px 0`,
      }}
    >
      <Body style={{ ...bodyStyle, fontStyle: "italic" }}>
        <Lead>Say this: </Lead>
        {children}
      </Body>
    </div>
  );
}

const frameStyle = {
  width: "100%",
  height: "auto",
  borderRadius: 10,
  border: `1px solid ${palette.gray.light2}`,
};

export function Screenshot({ src, alt, caption, width = 960, height = 540 }) {
  return (
    <figure style={{ margin: `${spacing[300]}px 0` }}>
      <Image src={src} alt={alt} width={width} height={height} style={frameStyle} />
      {caption && (
        <figcaption
          style={{
            marginTop: spacing[100],
            color: palette.gray.dark1,
            fontSize: 13,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* Drop-in slot for a screenshot we don't have yet — replace with <Screenshot /> */
export function ImagePlaceholder({ label }) {
  return (
    <div
      style={{
        ...frameStyle,
        border: `1px dashed ${palette.gray.light1}`,
        background: palette.gray.light3,
        color: palette.gray.dark1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        minHeight: 160,
        padding: spacing[400],
        margin: `${spacing[300]}px 0`,
        fontSize: 13,
      }}
    >
      🖼️ Screenshot placeholder — {label}
    </div>
  );
}
