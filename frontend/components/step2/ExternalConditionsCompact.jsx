"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { Body, Link } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { conditionConfig, RISK_TYPE_MAP } from "../../data/externalConditions";
import DocModelModal from "../modals/DocModelModal";
import { Card } from "@leafygreen-ui/card";
import SectionHeader from "../shared/SectionHeader";
import CurlyBraces from "@leafygreen-ui/icon/dist/CurlyBraces";
import IconButton from "@leafygreen-ui/icon-button";
import { Code } from "@leafygreen-ui/code";

const TTL_INDEX_SNIPPET = `db.external_conditions.createIndex(
   { "valid_until": 1 },
   { expireAfterSeconds: 3600 }
)`;

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
        title={modalCondition?.raw_headline}
        docModel={modalCondition}
        whyMDB={
          <>
            <strong>Automated Data Hygiene with TTL Indexes — </strong>
            Using MongoDB&apos;s built-in{" "}
            <strong>
              <Link
                href="https://www.mongodb.com/docs/manual/core/index-ttl/"
                target="_blank"
                rel="noopener noreferrer"
              >
                TTL (Time-To-Live) indexes
              </Link>
            </strong>
            , disruption records automatically expire after{" "}
            <code
              style={{
                fontFamily: "monospace",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              valid_until
            </code>
            . The database continuously cleans itself, eliminating manual cleanup
            processes.
            <div style={{ marginTop: spacing[300] }}>
              To create a TTL index, use{" "}
              <code
                style={{
                  fontFamily: "monospace",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                createIndex()
              </code>
              . For example:
            </div>
            <div style={{ marginTop: spacing[200] }}>
              <Code language="javascript">{TTL_INDEX_SNIPPET}</Code>
            </div>
          </>
        }
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
            const cfg =
              conditionConfig[RISK_TYPE_MAP[condition.risk_type_triggered]];
            if (!cfg) return null;
            return (
              <div
                key={condition.condition_id}
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
                  {condition.raw_headline}
                </Body>

                <Body
                  style={{ fontSize: 13, color: palette.gray.dark1, margin: 0 }}
                >
                  📍 {condition.affected_regions?.join(", ")}
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
