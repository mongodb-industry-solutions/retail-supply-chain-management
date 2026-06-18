"use client";

import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import Button from "@leafygreen-ui/button";

export default function WhyMongoDB({ children, title = "🍃 Why MongoDB?", onLearnMore, learnMoreLabel = "✨ Learn More" }) {
  return (
    <div
      style={{
        background: palette.green.light3,
        border: `1px solid ${palette.green.light2}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        className="d-flex align-items-center justify-content-between"
        style={{ marginBottom: spacing[200] }}
      >
        <Body weight="medium" style={{ color: palette.green.dark2, margin: 0 }}>
          {title}
        </Body>
        {onLearnMore && (
          <Button size="small" variant="default" onClick={onLearnMore}>
            {learnMoreLabel}
          </Button>
        )}
      </div>
      <Body style={{ color: palette.gray.dark2, margin: 0 }}>{children}</Body>
    </div>
  );
}
