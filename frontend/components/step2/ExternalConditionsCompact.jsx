"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { Body } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import Button from "@leafygreen-ui/button";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { conditionConfig } from "../../data/externalConditions";
import DocModelModal from "../modals/DocModelModal";
import { Card } from "@leafygreen-ui/card";
import SectionHeader from "../shared/SectionHeader";
import CurlyBraces from "@leafygreen-ui/icon/dist/CurlyBraces";
import IconButton from "@leafygreen-ui/icon-button";

const DOC_MODELS = {
  logistical: {
    condition_id: "COND-20260505-0941",
    source: "MarineTraffic",
    raw_headline:
      "Severe disruption reported at Red Sea corridor — vessels rerouting via Cape of Good Hope",
    risk_type_triggered: "logistics_disruption",
    affected_regions: ["SA", "EG", "YE", "DJ"],
    condition_score: 0.87,
    epicentre: { type: "Point", coordinates: [43.6229, 13.5127] },
    impact_radius_km: 320,
    detected_at: 'ISODate("2026-05-05T09:41:00Z")',
    "valid_until  // ← TTL index — auto-deletes in 72h":
      'ISODate("2026-05-08T09:41:00Z")',
  },
  geopolitical: {
    condition_id: "COND-20260505-1134",
    source: "Reuters / OFAC Sanctions Feed",
    raw_headline:
      "Expanded sanctions on cross-border freight — Eastern European trade routes restricted",
    risk_type_triggered: "geopolitical_disruption",
    affected_regions: ["UA", "BY", "RU", "PL"],
    condition_score: 0.91,
    epicentre: { type: "Point", coordinates: [30.5234, 50.4501] },
    impact_radius_km: 500,
    detected_at: 'ISODate("2026-05-05T11:34:00Z")',
    "valid_until  // ← TTL index — auto-deletes in 72h":
      'ISODate("2026-05-08T11:34:00Z")',
  },
  climate: {
    condition_id: "COND-20260505-1408",
    source: "NOAA National Hurricane Center",
    raw_headline:
      "Category 4 Hurricane Maria — landfall projected near Houston ports within 72h",
    risk_type_triggered: "climate_disruption",
    affected_regions: ["US-TX", "US-LA", "US-MS"],
    condition_score: 0.94,
    epicentre: { type: "Point", coordinates: [-95.3698, 29.7604] },
    impact_radius_km: 180,
    detected_at: 'ISODate("2026-05-05T14:08:00Z")',
    "valid_until  // ← TTL index — auto-deletes in 72h":
      'ISODate("2026-05-08T14:08:00Z")',
  },
};

export default function ExternalConditionsCompact() {
  const loadedConditions = useSelector(
    (s) => s.Global.loadedExternalConditions,
  );
  const [modalCondition, setModalCondition] = useState(null);

  if (!loadedConditions?.length) return null;

  return (
    <>
      <DocModelModal
        show={!!modalCondition}
        onHide={() => setModalCondition(null)}
        conditionType={modalCondition?.type}
        title={modalCondition?.title}
        docModel={modalCondition ? DOC_MODELS[modalCondition.type] : null}
      />

      <SectionHeader
        title="Supplier Impact Analysis"
        subtitle="AI-powered identification of suppliers affected by current external conditions"
      />

      <Card style={{ marginBottom: spacing[400] }}>
        <Body
          weight="medium"
          style={{
            fontSize: 13,
            color: palette.gray.dark1,
            marginBottom: spacing[200],
          }}
        >
          Active External Conditions ({loadedConditions.length})
        </Body>

        <div className="d-flex flex-column gap-2">
          {loadedConditions.map((condition) => {
            const cfg = conditionConfig[condition.type];
            if (!cfg) return null;
            return (
              <div
                key={condition.id ?? condition.type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing[200],
                  background: palette.gray.light3,
                  borderRadius: 8,
                  padding: `${spacing[200]}px ${spacing[400]}px`,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: cfg.bgColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {cfg.icon}
                </div>

                <Badge variant={cfg.variant}>{cfg.label}</Badge>

                <Body
                  weight="medium"
                  style={{
                    fontSize: 14,
                    color: palette.gray.dark3,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {condition.title}
                </Body>

                <Body
                  style={{ fontSize: 13, color: palette.gray.dark1, margin: 0 }}
                >
                  📍 {condition.region}
                </Body>
                <IconButton
                  onClick={() => setModalCondition(condition)}
                  aria-label="See document"
                >
                  <CurlyBraces />
                </IconButton>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
