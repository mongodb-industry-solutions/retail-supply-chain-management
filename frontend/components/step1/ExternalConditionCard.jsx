"use client";

import { Body } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { conditionConfig } from "../../data/externalConditions";
import { Card } from "@leafygreen-ui/card";

function formatTime(timestamp) {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ExternalConditionCard({ condition }) {
  const cfg = conditionConfig[condition.type];

  return (
    <Card>
      <div style={{ marginBottom: spacing[200] }}>
        <Badge variant={cfg.variant}>{cfg.icon} {cfg.label}</Badge>
      </div>

      <Body weight="medium" style={{ color: palette.gray.dark3, fontSize: 15, marginBottom: spacing[100] }}>
        {condition.title}
      </Body>

      <Body style={{ color: palette.gray.dark2, fontSize: 14, lineHeight: 1.6, marginBottom: spacing[200] }}>
        {condition.description}
      </Body>

      <div className="d-flex gap-3" style={{ fontSize: 13, color: palette.gray.dark1 }}>
        <span>🕐 {formatTime(condition.timestamp)}</span>
        {condition.region && <span>📍 {condition.region}</span>}
      </div>
    </Card>
  );
}
