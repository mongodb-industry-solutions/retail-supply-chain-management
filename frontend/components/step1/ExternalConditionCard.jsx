"use client";

import { Body } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { conditionConfig, RISK_TYPE_MAP } from "../../data/externalConditions";
import { Card } from "@leafygreen-ui/card";

function formatTime(timestamp) {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ExternalConditionCard({ condition }) {
  const cfg = conditionConfig[RISK_TYPE_MAP[condition.risk_type_triggered]];

  return (
    <Card>
      <div style={{ marginBottom: spacing[200] }}>
        <Badge variant={cfg.variant}>{cfg.icon} {cfg.label}</Badge>
      </div>

      <Body weight="medium" style={{ color: palette.gray.dark3, fontSize: 15, marginBottom: spacing[100] }}>
        {condition.raw_headline}
      </Body>

      <div className="d-flex gap-3" style={{ fontSize: 13, color: palette.gray.dark1, marginBottom: spacing[200] }}>
        <span>🕐 {formatTime(condition.timestamp)}</span>
        {condition.affected_regions?.length > 0 && (
          <span>📍 {condition.affected_regions.join(", ")}</span>
        )}
      </div>

      <div className="d-flex gap-3 flex-wrap" style={{ fontSize: 12, color: palette.gray.dark1 }}>
        <span style={{ color: palette.gray.dark2 }}>
          <span style={{ color: palette.gray.base }}>ID</span> {condition.condition_id}
        </span>
        <span>
          <span style={{ color: palette.gray.base }}>Source</span> {condition.source}
        </span>
        <span>
          <span style={{ color: palette.gray.base }}>Score</span> {condition.condition_score?.toFixed(2)}
        </span>
      </div>
    </Card>
  );
}
