"use client";

import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import Button from "@leafygreen-ui/button";
import { spacing } from "@leafygreen-ui/tokens";
import {
  advanceToStep,
  setSelectedSupplier,
  setAffectedSuppliers,
  appendAffectedSuppliersAgentReasoning,
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
import { Card } from "@leafygreen-ui/card";

const GEO_QUERY = `
  # geospatial path: conditions with a physical epicentre (e.g. earthquakes, port closures)
  if external_condition.get("has_physical_location"):
      lng, lat = external_condition["epicentre"]["coordinates"]
      # convert km to radians using Earth's radius (~6378.1 km) for $centerSphere
      radius_radians = external_condition["impact_radius_km"] / 6378.1
      supplier_query = {
          "location": {
              "$geoWithin": {"$centerSphere": [[lng, lat], radius_radians]}
          }
      }
  # region path: non-physical conditions (e.g. trade or regulatory changes)
  else:
      supplier_query = {"region": {"$in": external_condition["affected_regions"]}}

  matched = await db["suppliers"].find(supplier_query).to_list(length=None)
`;

export default function Step2() {
  const dispatch = useDispatch();
  const sessionId = useSelector((s) => s.Global.sessionId);
  const affectedSuppliers = useSelector((s) => s.Global.affectedSuppliers);
  const affectedSuppliersAgentReasoning = useSelector((s) => s.Global.affectedSuppliersAgentReasoning);
  const agentCurrentThought = useSelector((s) => s.Global.affectedSuppliersAgentCurrentThought);
  const selectedSupplier = useSelector((s) => s.Global.selectedSupplier);
  const agentDone = useSelector((s) => s.Global.affectedSuppliersAgentDone);
  const [logsOpen, setLogsOpen] = useState(false);
  const [showGeoQuery, setShowGeoQuery] = useState(false);

  useEffect(() => {
    if (affectedSuppliers.length > 0) return;

    async function runEvaluate() {
      try {
        const response = await fetch("/api/simulation/evaluate", {
          method: "POST",
          headers: { "X-Session-ID": sessionId },
        });

        if (!response.ok || !response.body) {
          throw new Error(`Evaluate failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop();
          for (const frame of frames) {
            const line = frame.trim();
            if (line.startsWith("data:")) {
              const event = JSON.parse(line.slice(5).trim());
              console.log("[evaluate]", event.type);
              if (event.type === "agent_response") {
                dispatch(setAffectedSuppliers(event.data.suppliers || []));
              }
              dispatch(appendAffectedSuppliersAgentReasoning(event));
            }
          }
        }
      } catch (err) {
        console.error("[evaluate] stream error", err);
      } finally {
      }
    }

    runEvaluate();
  }, []);

  const handleFindAlternatives = (supplier) => {
    if(selectedSupplier !== null && selectedSupplier.supplier_id === supplier.supplier_id) {
      dispatch(advanceToStep(3))
      return
    }
    dispatch(setSelectedSupplier(supplier));
    dispatch(advanceToStep(3));
  };

  return (
    <div>
      <ExternalConditionsCompact />

      <ReActAgent
        title="Identifying affected suppliers"
        subtitle="The ReAct (Reason + Act) agent will cross-reference all active external conditions against your supplier base to determine which suppliers are impacted, and to which degree."
        phases={[
          {
            name: "Affected suppliers",
            steps: affectedSuppliersAgentReasoning || [],
          },
        ]}
        agentCurrentThought={agentCurrentThought}
        done={agentDone}
        onViewLogs={() => setLogsOpen(true)}
      />

      <LogDrawer
        show={logsOpen}
        onHide={() => setLogsOpen(false)}
        title="Agent Execution Logs"
        subtitle="ReAct Agent powered by LangGraph + MongoDB Atlas"
        phases={[{ name: "Affected suppliers", steps: affectedSuppliersAgentReasoning || [] }]}
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
            <Card
              className="container mb-2 p-2"
              style={{ backgroundColor: "#dedede" }}
            >
              <Code
                language="python"
                showLineNumbers={true}
                darkMode={false}
                copyButtonAppearance="persist"
                highlightLines={[8, 15]}
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
