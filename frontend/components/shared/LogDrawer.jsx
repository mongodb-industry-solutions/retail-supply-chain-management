"use client";

import { useEffect, useRef } from "react";
import Accordion from "react-bootstrap/Accordion";
import { Drawer } from "@leafygreen-ui/drawer";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import WhyMongoDB from "./WhyMongoDB";
import Icon from "@leafygreen-ui/icon";

function renderBoldMarkdown(text) {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

// Normalize a step from either format:
//   Format A -> keyed on `type`, has `ts`
//   Format B -> keyed on `event`, has `timestamp`
function normalizeStep(step) {
  const kind = step.event ?? step.type;
  const fmt = step.event ? "B" : "A";
  const ts =
    step.ts != null
      ? step.ts
      : step.timestamp
        ? Date.parse(step.timestamp)
        : null;
  return { ...step, kind, fmt, ts };
}

// Turn a flat list of (normalized) steps into renderable blocks.
function buildBlocks(rawSteps) {
  const steps = rawSteps.map(normalizeStep);
  const firstTs = steps[0]?.ts;
  const blocks = [];
  let group = null; // Format A tool_start..tool_end grouping
  let bTool = null; // Format B pending tool_start

  steps.forEach((step) => {
    if (step.fmt === "A") {
      if (step.kind === "tool_start") {
        group = { header: step, items: [] };
        blocks.push({ kind: "group", group });
      } else if (step.kind === "tool_end") {
        const startTs = group?.header?.ts;
        const duration =
          startTs && step.ts ? (step.ts - startTs) / 1000 : null;
        group = null;
        blocks.push({ kind: "tool_end", log: step, duration });
      } else if (step.kind === "agent_response") {
        const duration = firstTs && step.ts ? (step.ts - firstTs) / 1000 : null;
        group = null;
        blocks.push({ kind: "agent_response", log: step, duration });
      } else if (group) {
        group.items.push(step);
      } else {
        blocks.push({ kind: "orphan", log: step });
      }
      return;
    }

    // Format B
    switch (step.kind) {
      case "tool_start":
        bTool = { start: step, items: [] };
        break;
      case "tool_end": {
        const startTs = bTool?.start?.ts;
        const duration =
          startTs && step.ts ? (step.ts - startTs) / 1000 : null;
        blocks.push({
          kind: "tool_call",
          start: bTool?.start ?? null,
          end: step,
          items: bTool?.items ?? [],
          duration,
        });
        bTool = null;
        break;
      }
      case "atlas_operation":
      case "agent_thought":
        if (bTool) bTool.items.push(step);
        else blocks.push({ kind: step.kind, log: step });
        break;
      case "layer_started":
      case "layer_completed":
      case "candidate_generated":
      case "candidate_audited":
      case "shortlist_ready":
        blocks.push({ kind: step.kind, log: step });
        break;
      default:
        blocks.push({ kind: "orphan", log: step });
    }
  });

  return blocks;
}

const CRITERION_COLORS = {
  compliant: palette.green.dark1,
  unknown: palette.gray.base,
};
function criterionColor(status) {
  return CRITERION_COLORS[status] ?? palette.red.base;
}

const cardBase = {
  background: palette.white,
  borderRadius: 6,
  padding: "10px 14px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  marginBottom: spacing[200],
};

function RowHeader({ glyph, accent, label, time }) {
  return (
    <div className="d-flex justify-content-between align-items-start">
      <div
        style={{ fontWeight: 600, fontSize: 13, color: palette.gray.dark3 }}
      >
        <Icon glyph={glyph} size="small" fill={accent} /> {label}
      </div>
      {time && (
        <small
          className="text-secondary"
          style={{
            fontSize: 11,
            whiteSpace: "nowrap",
            marginLeft: spacing[300],
          }}
        >
          {time}
        </small>
      )}
    </div>
  );
}

// --- Format B block renderers -------------------------------------------

function LayerStartedBlock({ log }) {
  return (
    <div
      style={{
        ...cardBase,
        background: palette.blue.light3,
        borderLeft: `3px solid ${palette.blue.base}`,
      }}
    >
      <RowHeader
        glyph="Play"
        accent={palette.blue.dark1}
        label={log.label ?? "Layer started"}
        time={log.time}
      />
    </div>
  );
}

function LayerCompletedBlock({ log }) {
  return (
    <div
      style={{
        ...cardBase,
        background: palette.green.light3,
        borderLeft: `3px solid ${palette.green.dark1}`,
      }}
    >
      <RowHeader
        glyph="CheckmarkWithCircle"
        accent={palette.green.dark2}
        label={log.summary ?? "Layer completed"}
        time={log.time}
      />
    </div>
  );
}

function AtlasOpBlock({ log }) {
  const metrics = log.metrics ?? {};
  return (
    <div style={{ ...cardBase, borderLeft: `3px solid ${palette.green.dark1}` }}>
      <RowHeader
        glyph="Wrench"
        accent={palette.green.dark1}
        label={`${log.operation_type ?? "operation"} on ${log.collection}`}
        time={log.time}
      />
      {log.description && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: palette.gray.dark2,
            marginTop: 6,
          }}
        >
          {log.description}
        </div>
      )}
      {Object.keys(metrics).length > 0 && (
        <div className="d-flex flex-wrap gap-2" style={{ marginTop: 6 }}>
          {Object.entries(metrics).map(([k, v]) => (
            <span
              key={k}
              style={{
                background: palette.gray.light2,
                color: palette.gray.dark2,
                borderRadius: 10,
                padding: "2px 8px",
                fontSize: 11,
              }}
            >
              {k.replace(/_/g, " ")}: <strong>{v}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ThoughtBlock({ log }) {
  return (
    <div style={{ ...cardBase, borderLeft: `3px solid ${palette.blue.base}` }}>
      <RowHeader
        glyph="SMS"
        accent={palette.blue.base}
        label={log.step ? `Agent thought — ${log.step}` : "Agent thought"}
        time={log.time}
      />
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: palette.gray.dark2,
          marginTop: 6,
          whiteSpace: "pre-wrap",
        }}
      >
        {renderBoldMarkdown(log.text ?? log.message ?? "")}
      </div>
    </div>
  );
}

function ToolCallBlock({ start, end, items, duration }) {
  const args = start?.args ?? {};
  return (
    <Accordion style={{ borderBottom: "1px solid grey" }}>
      <Accordion.Header>
        <div>
          <Icon glyph="Wrench" fill={palette.purple.base} />{" "}
          {`Tool: ${start?.tool ?? end?.tool ?? "unknown"}`}
          {duration != null ? ` — (${duration.toFixed(2)}s)` : ""}
          <br />
          <small className="text-secondary">{(start ?? end)?.time}</small>
        </div>
      </Accordion.Header>
      <Accordion.Body style={{ background: palette.gray.light3 }}>
        {Object.keys(args).length > 0 && (
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            <strong>Args:</strong> {JSON.stringify(args)}
          </div>
        )}
        {items.map((item, i) =>
          item.kind === "agent_thought" ? (
            <ThoughtBlock key={i} log={item} />
          ) : (
            <AtlasOpBlock key={i} log={item} />
          ),
        )}
        {end?.result_summary && (
          <div
            style={{
              fontSize: 13,
              color: palette.gray.dark2,
              borderLeft: `3px solid ${palette.green.dark1}`,
              paddingLeft: 8,
            }}
          >
            {end.result_summary}
          </div>
        )}
      </Accordion.Body>
    </Accordion>
  );
}

function CandidateGeneratedBlock({ log }) {
  return (
    <div
      style={{
        ...cardBase,
        borderLeft: `3px solid ${palette.purple.base}`,
      }}
    >
      <RowHeader
        glyph="Person"
        accent={palette.purple.base}
        label={`Candidate: ${log.supplier_name ?? log.supplier_id}`}
        time={log.time}
      />
      <div style={{ fontSize: 12, color: palette.gray.dark1, marginTop: 4 }}>
        {log.supplier_id} · {log.location} · {log.category}
      </div>
    </div>
  );
}

function Citation({ citation }) {
  if (!citation) return null;
  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 8px",
        background: palette.gray.light3,
        borderRadius: 4,
        fontSize: 12,
        color: palette.gray.dark2,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        <Icon glyph="File" size="small" /> {citation.source_file}
        {citation.page ? ` · p.${citation.page}` : ""}
        {citation.chunk_id ? ` · ${citation.chunk_id}` : ""}
      </div>
      <div style={{ marginTop: 4, fontStyle: "italic" }}>
        “{citation.excerpt}”
      </div>
      {citation.valid_until && (
        <div style={{ marginTop: 4 }}>
          Valid until: {citation.valid_until.slice(0, 10)}
        </div>
      )}
    </div>
  );
}

function CandidateAuditedBlock({ log }) {
  const criteria = log.criteria ?? [];
  const coverage = log.evidence_coverage ?? {};
  const precedent = log.precedent ?? {};

  return (
    <Accordion style={{ borderBottom: "1px solid grey" }}>
      <Accordion.Header>
        <div>
          <Icon glyph="MagnifyingGlass" fill={palette.blue.dark1} />{" "}
          {`Audited: ${log.supplier_id}`}
          {coverage.criteria_total != null
            ? ` — ${coverage.criteria_verified}/${coverage.criteria_total} verified`
            : ""}
          <br />
          <small className="text-secondary">{log.time}</small>
        </div>
      </Accordion.Header>
      <Accordion.Body style={{ background: palette.gray.light3 }}>
        <div className="d-flex flex-column gap-2">
          {criteria.map((c, i) => (
            <div key={i} style={{ ...cardBase, marginBottom: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <span
                  style={{
                    background: criterionColor(c.status),
                    color: palette.white,
                    borderRadius: 10,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {c.status}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {c.criterion.replace(/_/g, " ")}
                </span>
              </div>
              {c.note && (
                <div
                  style={{
                    fontSize: 12,
                    color: palette.gray.dark2,
                    marginTop: 4,
                  }}
                >
                  {c.note}
                </div>
              )}
              <Citation citation={c.citation} />
            </div>
          ))}

          {(precedent.exact_track_record || precedent.semantic_precedent) && (
            <div style={{ ...cardBase, marginBottom: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                <Icon glyph="Clock" size="small" /> Precedent
              </div>
              {precedent.exact_track_record && (
                <div style={{ fontSize: 12, color: palette.gray.dark2 }}>
                  Track record:{" "}
                  {precedent.exact_track_record.found
                    ? `${precedent.exact_track_record.outcome} (${precedent.exact_track_record.memory_id})`
                    : "none"}
                </div>
              )}
              {precedent.semantic_precedent && (
                <div style={{ fontSize: 12, color: palette.gray.dark2 }}>
                  Semantic:{" "}
                  {precedent.semantic_precedent.found
                    ? `${precedent.semantic_precedent.strength} (score ${precedent.semantic_precedent.score})`
                    : "none"}
                </div>
              )}
            </div>
          )}
        </div>
      </Accordion.Body>
    </Accordion>
  );
}

function ShortlistCard({ log }) {
  const candidates = log.candidates ?? [];
  return (
    <div
      className="success-card container pt-3 pb-3"
      style={{ marginBottom: spacing[300] }}
    >
      <div className="d-flex align-items-center gap-2 w-100">
        <Icon
          glyph="CheckmarkWithCircle"
          fill={palette.green.dark2}
          size="xlarge"
        />
        <div style={{ flex: 1 }}>
          <div
            style={{ fontWeight: 700, fontSize: 16, color: palette.gray.dark3 }}
          >
            Shortlist Ready
          </div>
          <div style={{ fontSize: 12, color: palette.gray.dark1 }}>
            {log.time}
          </div>
        </div>
        <span
          style={{
            background: palette.green.light2,
            color: palette.green.dark2,
            borderRadius: 12,
            padding: "4px 10px",
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: 0.4,
          }}
        >
          {candidates.length} CANDIDATE{candidates.length === 1 ? "" : "S"}
        </span>
      </div>

      <div
        style={{
          borderTop: `1px solid ${palette.green.light2}`,
          paddingTop: spacing[300],
          marginTop: spacing[200],
        }}
      >
        {candidates.map((c, i) => (
          <div
            key={i}
            className="d-flex justify-content-between align-items-center"
            style={{
              fontSize: 13,
              color: palette.gray.dark2,
              padding: "4px 0",
            }}
          >
            <span>
              <strong>{c.supplier_name}</strong> · {c.location}
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              {c.proximity_km != null ? `${Math.round(c.proximity_km)} km` : ""}
              {c.evidence_coverage
                ? ` · ${c.evidence_coverage.criteria_verified}/${c.evidence_coverage.criteria_total}`
                : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Format A group items ------------------------------------------------

function AGroupItem({ item }) {
  const isThought = item.type === "agent_thought";
  const accent = isThought ? palette.blue.base : palette.green.dark1;
  return (
    <div
      style={{
        background: palette.white,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: "10px 14px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <RowHeader
        glyph={isThought ? "SMS" : "Wrench"}
        accent={accent}
        label={
          isThought
            ? "Agent thought"
            : `Calling tool: ${item.feature} on ${item.collection}`
        }
        time={item.time}
      />
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: palette.gray.dark2,
          marginTop: 6,
          whiteSpace: "pre-wrap",
        }}
      >
        {isThought ? renderBoldMarkdown(item.message) : item.detail}
      </div>
    </div>
  );
}

function renderBlock(block, key) {
  switch (block.kind) {
    case "group": {
      const { header, items } = block.group;
      return (
        <Accordion key={key} style={{ borderBottom: "1px solid grey" }}>
          <Accordion.Header
            className={items.length === 0 ? "no-caret" : ""}
          >
            <div>
              <Icon glyph="Refresh" /> {header.message}
              <br />
              <small className="text-secondary">{header.time}</small>
            </div>
          </Accordion.Header>
          {items.length > 0 && (
            <Accordion.Body style={{ background: palette.gray.light3 }}>
              <div className="d-flex flex-column gap-3">
                {items.map((item, i) => (
                  <AGroupItem key={i} item={item} />
                ))}
              </div>
            </Accordion.Body>
          )}
        </Accordion>
      );
    }
    case "tool_end":
      return (
        <Accordion key={key} style={{ borderBottom: "1px solid grey" }}>
          <Accordion.Header className="no-caret">
            <div>
              <Icon color="green" glyph="CheckmarkWithCircle" />{" "}
              {block.log.message.replace("...", "")}
              {block.duration != null ? ` - (${block.duration.toFixed(2)}s)` : ""}
              <br />
              <small className="text-secondary">{block.log.time}</small>
            </div>
          </Accordion.Header>
        </Accordion>
      );
    case "agent_response": {
      const suppliers = block.log.data?.suppliers ?? [];
      const conditions = block.log.data?.conditions ?? [];
      const actionCount = suppliers.filter((s) => s.requires_action).length;
      return (
        <div
          key={key}
          className="success-card container pt-3 pb-3"
          style={{ marginBottom: spacing[300] }}
        >
          <div className="d-flex align-items-center gap-2 w-100">
            <Icon
              glyph="CheckmarkWithCircle"
              fill={palette.green.dark2}
              size="xlarge"
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: palette.gray.dark3,
                }}
              >
                Analysis Complete
              </div>
              <div style={{ fontSize: 12, color: palette.gray.dark1 }}>
                {block.duration != null
                  ? `Processed in ${block.duration.toFixed(2)}s`
                  : block.log.time}
              </div>
            </div>
            <span
              style={{
                background: palette.green.light2,
                color: palette.green.dark2,
                borderRadius: 12,
                padding: "4px 10px",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: 0.4,
              }}
            >
              SUCCESS
            </span>
          </div>
          <div
            className="d-flex align-items-start gap-2"
            style={{
              borderTop: `1px solid ${palette.green.light2}`,
              paddingTop: spacing[300],
              fontSize: 13,
              color: palette.gray.dark2,
            }}
          >
            <Icon glyph="Wizard" fill={palette.green.dark1} size="small" />
            <span>
              Found <strong>{suppliers.length}</strong> supplier
              {suppliers.length === 1 ? "" : "s"} exposed across{" "}
              <strong>{conditions.length}</strong> active risk condition
              {conditions.length === 1 ? "" : "s"}
              {actionCount > 0 && (
                <>
                  , <strong>{actionCount}</strong> requiring immediate action
                </>
              )}
              .
            </span>
          </div>
        </div>
      );
    }
    case "layer_started":
      return <LayerStartedBlock key={key} log={block.log} />;
    case "layer_completed":
      return <LayerCompletedBlock key={key} log={block.log} />;
    case "atlas_operation":
      return <AtlasOpBlock key={key} log={block.log} />;
    case "agent_thought":
      return <ThoughtBlock key={key} log={block.log} />;
    case "tool_call":
      return (
        <ToolCallBlock
          key={key}
          start={block.start}
          end={block.end}
          items={block.items}
          duration={block.duration}
        />
      );
    case "candidate_generated":
      return <CandidateGeneratedBlock key={key} log={block.log} />;
    case "candidate_audited":
      return <CandidateAuditedBlock key={key} log={block.log} />;
    case "shortlist_ready":
      return <ShortlistCard key={key} log={block.log} />;
    default:
      return null;
  }
}

export default function LogDrawer({
  show,
  onHide,
  title = "",
  subtitle = "",
  phases = [],
}) {
  const listRef = useRef(null);

  const totalSteps = phases.reduce(
    (sum, phase) => sum + (phase.steps?.length ?? 0),
    0,
  );

  useEffect(() => {
    if (!show || !listRef.current) return;
    const scrollContainer = listRef.current.closest(
      '[data-testid="log-drawer-scroll_container"]',
    );
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [show, totalSteps]);

  return (
    <>
      <style>{`
        .no-caret .accordion-button::after {
          display: none !important;
        }
        .success-card {
          border: 2px solid ${palette.green.base} !important;
          border-radius: 10px !important;
          overflow: hidden;
          background: linear-gradient(135deg, ${palette.green.light3}, ${palette.white});
        }
        .success-card .accordion-button,
        .success-card .accordion-button:not(.collapsed) {
          background: transparent !important;
          box-shadow: none !important;
        }
      `}</style>
      <Drawer
        open={show}
        onClose={onHide}
        data-lgid="log-drawer"
        title={
          <div
            className="d-flex flex-column"
            style={{ height: "fit-content", margin: "10px 0" }}
          >
            <p className="m-0">{title}</p>
            <small style={{ fontSize: 13 }} className="text-secondary m-0">
              {subtitle}
            </small>
          </div>
        }
        displayMode="overlay"
        size="default"
        style={{
          borderLeft: `2px solid ${palette.gray.dark2}`,
          boxShadow: `-4px 0 12px rgba(0,0,0,0.4)`,
        }}
      >
        <div>
          <WhyMongoDB title="🍃 LangGraph + MongoDB">
            LangChain and MongoDB{" "}
            <a
              href="https://www.mongodb.com/docs/atlas/ai-integrations/langgraph/build-agents/"
              target="_blank"
              rel="noopener noreferrer"
            >
              combined stack
            </a>{" "}
            gives agents retrieval, persistent memory, access to operational
            data, observability, and reliable deployment across the full
            pipeline — all without rearchitecting the data layer.
          </WhyMongoDB>

          <div ref={listRef} className="d-flex flex-column mt-3">
            {phases.map((phase, phaseIdx) => {
              const blocks = buildBlocks(phase.steps ?? []);
              return (
                <div key={phaseIdx} className="d-flex flex-column">
                  <h6
                    style={{
                      fontWeight: 700,
                      color: palette.gray.dark3,
                      marginTop: phaseIdx === 0 ? 0 : spacing[400],
                      marginBottom: spacing[200],
                    }}
                  >
                    {phase.name}
                  </h6>
                  {blocks.map((block, blockIdx) =>
                    renderBlock(block, blockIdx),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Drawer>
    </>
  );
}