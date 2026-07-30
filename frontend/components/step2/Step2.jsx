"use client";

import { useState, useEffect, useRef } from "react";
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
import { palette } from "@leafygreen-ui/palette";
import { conditionConfig, RISK_TYPE_MAP } from "../../data/externalConditions";

// The condition types a supplier was actually impacted by, normalised from the
// raw risk_type_triggered keys ("logistics_disruption") to conditionConfig keys
// ("logistical") via RISK_TYPE_MAP.
function supplierConditionTypes(supplier) {
  return new Set(
    (supplier.risk_scores ?? [])
      .map((risk) => RISK_TYPE_MAP[risk.triggered_by?.risk_type_triggered])
      .filter(Boolean),
  );
}

function FilterPill({ label, count, active, activeColors, onClick }) {
  const colors = active
    ? activeColors
    : { bgColor: palette.white, borderColor: palette.gray.light1, color: palette.gray.dark1 };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        background: colors.bgColor,
        border: `1px solid ${colors.borderColor}`,
        color: colors.color,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      {label}
      <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{count}</span>
    </button>
  );
}

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
  // Condition-type filter for the affected suppliers list. Empty = show all.
  const [activeTypes, setActiveTypes] = useState([]);

  const toggleType = (type) =>
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );

  // One pill per condition type, always all three, each with a live count.
  const typeCounts = Object.fromEntries(
    Object.keys(conditionConfig).map((type) => [
      type,
      affectedSuppliers.filter((s) => supplierConditionTypes(s).has(type)).length,
    ]),
  );

  // OR semantics: a supplier shows if it carries any of the selected types.
  const filteredSuppliers = activeTypes.length
    ? affectedSuppliers.filter((s) => {
        const types = supplierConditionTypes(s);
        return activeTypes.some((t) => types.has(t));
      })
    : affectedSuppliers;

  // Guards against React Strict Mode's intentional double-invoke of mount effects
  // in development. Redux state alone can't guard here because it's only populated
  // AFTER the fetch resolves — both Strict Mode passes run before that, so they'd
  // both pass a state-only check. This ref flips synchronously, before the first
  // await, so the second pass is blocked immediately.
  const startedRef = useRef(false);

  useEffect(() => {
    if (affectedSuppliers.length > 0) return; // skip if data already loaded (e.g. real remount)
    if (startedRef.current) return;           // skip if a run has already started (Strict Mode's 2nd pass)
    startedRef.current = true;                // set BEFORE any await — must stay synchronous

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
            name: null,
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
          
          {/* Filter the affected suppliers list by external condition type */}
          <div
            className="d-flex align-items-center flex-wrap gap-2"
            style={{ marginBottom: spacing[300] }}
          >
            <FilterPill
              label="All"
              count={affectedSuppliers.length}
              active={activeTypes.length === 0}
              activeColors={{
                bgColor: palette.green.light3,
                borderColor: palette.green.base,
                color: palette.green.dark2,
              }}
              onClick={() => setActiveTypes([])}
            />
            {Object.entries(conditionConfig).map(([type, cfg]) => (
              <FilterPill
                key={type}
                label={`${cfg.icon} ${cfg.label}`}
                count={typeCounts[type]}
                active={activeTypes.includes(type)}
                activeColors={cfg}
                onClick={() => toggleType(type)}
              />
            ))}
          </div>

          <div className="row g-4" style={{ marginBottom: spacing[400] }}>
            <div className="col-7">
              <SupplierGrid
                suppliers={filteredSuppliers}
                onFindAlternatives={handleFindAlternatives}
              />
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
