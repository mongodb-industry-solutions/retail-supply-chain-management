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
import {Card} from "@leafygreen-ui/card";

const AGENT_PHASES = [
  {
    name: "Affected suppliers",
    steps: [
      "Identifying suppliers inside the affected external condition area",
      "Context Assembly (knowledge, memory, state)",
      "Calculating Dynamic Risk Priority Number (RPN) for the suppliers",
      "Writing the evaluations to MongoDB",
    ],
  },
];

const AGENT_LOG_PHASES = [
  {
    name: "Affected suppliers",
    steps: [
      {
        name: "Identifying suppliers inside the affected external condition area",
        logs: [
          "Loading external condition zones from MongoDB...",
          "Running $geoWithin query on supplier collection...",
          "Found 7 suppliers within 320 km radius of Red Sea epicentre",
        ],
      },
      {
        name: "Context Assembly (knowledge, memory, state)",
        logs: [
          "Fetching supplier contracts from Atlas...",
          "Loading agent memory: 3 historical episodes retrieved",
          "Assembling context window (4,200 tokens)",
        ],
      },
      {
        name: "Calculating Dynamic Risk Priority Number (RPN) for the suppliers",
        logs: [
          "Applying severity weight: 1.8 (logistical disruption)",
          "RPN updated for 5 critical suppliers",
          "Highest RPN: Shenzhen Electronics Co. → 847",
        ],
      },
      {
        name: "Writing the evaluations to MongoDB",
        logs: [
          "Writing 7 supplier evaluations to MongoDB...",
          "Collection: supplier_risk_evaluations",
          "Acknowledged: 7 documents written",
        ],
      },
    ],
  },
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
        phases={AGENT_PHASES}
        onComplete={() => setAgentDone(true)}
        onViewLogs={() => setLogsOpen(true)}
      />

      <LogDrawer
        show={logsOpen}
        onHide={() => setLogsOpen(false)}
        title="Agent Execution Logs"
        subtitle="ReAct Agent powered by LangGraph + MongoDB Atlas"
        phases={AGENT_LOG_PHASES}
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
            <div className="col-7">
              <SupplierGrid onFindAlternatives={handleFindAlternatives} />
            </div>
            <div className="col-5">
              <WorldMap />
            </div>
          </div>
          <BehindTheScenes />
        </>
      )}
    </div>
  );
}
