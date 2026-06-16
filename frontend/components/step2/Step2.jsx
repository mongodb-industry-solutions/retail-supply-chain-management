"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import Button from "@leafygreen-ui/button";
import { spacing } from "@leafygreen-ui/tokens";
import {
  advanceToStep,
  setSelectedSupplier,
  setSelectedAlertType,
} from "../../redux/slices/GlobalSlice";
import SectionHeader from "../shared/SectionHeader";
import ReActAgent from "../shared/ReActAgent";
import LogDrawer from "../shared/LogDrawer";
import WhyMongoDB from "../shared/WhyMongoDB";
import ExternalConditionsCompact from "./ExternalConditionsCompact";
import SupplierGrid from "./SupplierGrid";
import WorldMap from "./WorldMap";
import BehindTheScenes from "./BehindTheScenes";
import Icon from "@leafygreen-ui/icon";
import { Code } from "@leafygreen-ui/code";
import Card from "@leafygreen-ui/card";

const AGENT_STEPS = [
  "Connecting to MongoDB Atlas cluster...",
  "Fetching active external condition events from change stream...",
  "Cross-referencing supplier contracts with affected regions...",
  "Running geospatial risk assessment via Atlas Search...",
  "Calculating compound risk scores using Aggregation Pipeline...",
  "Ranking suppliers by exposure and contract value...",
  "Analysis complete — suppliers identified with critical exposure.",
];

const AGENT_LOGS = [
  "Identifying suppliers inside the affected external condition area",
  "Context Assembly (knowledge, memory, tool state)",
  "Calculating Dynamic Risk Priority Number (RPN) for affected suppliers",
  "Writing supplier evaluations to MongoDB",
];

const GEO_QUERY = `db.suppliers.aggregate([
  {
    $match: {
      "location.geopoint": {
        $geoWithin: {
          $centerSphere: [
            [43.6229, 13.5127],   // Red Sea epicentre (lon, lat)
            320 / 6378.1          // 320 km radius in radians
          ]
        }
      }
    }
  },
  {
    $addFields: {
      riskScore: {
        $multiply: ["$rpnBase", "$condition.severity_weight"]
      }
    }
  },
  { $sort: { riskScore: -1 } },
  { $limit: 10 }
])`;

export default function Step2() {
  const dispatch = useDispatch();
  const [agentDone, setAgentDone] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [showGeoQuery, setShowGeoQuery] = useState(false);

  const handleFindAlternatives = (supplier) => {
    dispatch(setSelectedSupplier(supplier));
    dispatch(
      setSelectedAlertType(supplier.affectedConditions?.[0] ?? "logistical"),
    );
    dispatch(advanceToStep(3));
  };

  return (
    <div>
      <ExternalConditionsCompact />

      <ReActAgent
        title="Identifying affected suppliers"
        subtitle="The ReAct (Reason + Act) agent will cross-reference all active external conditions against your supplier base to determine which suppliers are impacted, and to which degree."
        steps={AGENT_STEPS}
        onComplete={() => setAgentDone(true)}
        onViewLogs={() => setLogsOpen(true)}
      />

      <LogDrawer
        show={logsOpen}
        onHide={() => setLogsOpen(false)}
        title="Agent Execution Logs"
        subtitle="ReAct Agent powered by LangGraph + MongoDB Atlas"
        logs={AGENT_LOGS}
      />

      {agentDone && (
        <>
          <SectionHeader
            title="Affected Suppliers"
            subtitle="Select a supplier to view detailed impact and explore alternative options"
            rightElement={
              <Button
                variant="default"
                size="small"
                onClick={() => setShowGeoQuery((v) => !v)}
                leftGlyph={<Icon glyph="GlobeAmericas" />}
              >
                {showGeoQuery ? "Hide" : "Show"} geospatial aggregation pipeline
              </Button>
            }
          />
          {showGeoQuery && (
            <Card className="container mb-2 p-2" style={{ backgroundColor: "#dedede" }}>
              <Code
                language="javascript"
                showLineNumbers={true}
                darkMode={true}
                copyButtonAppearance="persist"
              >
                {GEO_QUERY}
              </Code>
              <br></br>
              <WhyMongoDB>
                Atlas natively stores supplier{" "}
                <code
                  style={{
                    fontFamily: "monospace",
                    background: "#dcfce7",
                    padding: "1px 4px",
                    borderRadius: 3,
                  }}
                >
                  GeoJSON
                </code>{" "}
                coordinates alongside contract and risk data in a single
                document. The{" "}
                <code
                  style={{
                    fontFamily: "monospace",
                    background: "#dcfce7",
                    padding: "1px 4px",
                    borderRadius: 3,
                  }}
                >
                  $geoWithin
                </code>{" "}
                operator lets the Aggregation Pipeline filter suppliers by
                geographic proximity to a disruption epicentre — no separate
                Geographic Information System (GIS) system required.
              </WhyMongoDB>
            </Card>
          )}
          <div className="row g-4" style={{ marginBottom: spacing[400] }}>
            <div className="col-8">
              <SupplierGrid onFindAlternatives={handleFindAlternatives} />
            </div>
            <div className="col-4">
              <WorldMap />
            </div>
          </div>
          <BehindTheScenes />
        </>
      )}
    </div>
  );
}
