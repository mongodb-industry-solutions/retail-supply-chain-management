"use client";

import { Drawer } from "@leafygreen-ui/drawer";

import { ExpandableCard } from "@leafygreen-ui/expandable-card";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import WhyMongoDB from "./WhyMongoDB";

const TYPE_VARIANT = { thought: "green", tool: "blue", observation: "yellow" };

const BORDER_COLOR = {
  tool: palette.blue.light1,
  thought: palette.green.base,
  observation: palette.yellow.light1,
};

export default function LogDrawer({
  show,
  onHide,
  title = "",
  subtitle = "",
  logs = [],
}) {
  const isStringLog = logs.length > 0 && typeof logs[0] === "string";

  return (
    <>
      <style>{`
        [data-lgid="log-drawer"] > div > div:first-child,
        [data-testid="log-drawer"] > div > div:first-child {
          height: fit-content !important;
          margin: 12px 0px 12px 0px  !important;
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
            <p className="m-0">{title} </p>
            <small style={{ fontSize: 13 }} className="text-secondary m-0">
              {" "}
              {subtitle}{" "}
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
          {/* LangGraph + MongoDB banner */}
          <WhyMongoDB title="🍃 LangGraph + MongoDB">
            LangChain and MongoDB <a href="https://www.mongodb.com/docs/atlas/ai-integrations/langgraph/build-agents/" target="_blank">combined stack</a> gives agents retrieval, persistent memory, access to operational data, observability, and reliable deployment across the full pipeline — all without rearchitecting the data layer.
          </WhyMongoDB>
          <br></br>
          <div className="d-flex flex-column gap-2">
            {isStringLog
              ? logs.map((label, i) => (
                  <ExpandableLogCard key={i} index={i} label={label} />
                ))
              : logs.map((log, i) => <FlatLogEntry key={i} log={log} />)}
          </div>
        </div>
      </Drawer>
    </>
  );
}

function ExpandableLogCard({ index, label }) {
  return (
    <ExpandableCard
      title={`Step ${index + 1}`}
      description={label}
      flagText="agent"
    >
      <p
        style={{
          fontSize: 13,
          color: palette.gray.light1,
          margin: 0,
          fontStyle: "italic",
        }}
      >
        Execution details for this step are streamed live during agent run.
      </p>
    </ExpandableCard>
  );
}

function FlatLogEntry({ log }) {
  const borderColor = BORDER_COLOR[log.type] ?? palette.gray.light1;
  const typeColor =
    log.type === "thought"
      ? palette.green.light1
      : log.type === "tool"
        ? palette.blue.light1
        : palette.yellow.light1;

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        padding: `${spacing[200]}px ${spacing[400]}px`,
        background: palette.gray.dark3,
        borderRadius: "0 8px 8px 0",
      }}
    >
      <div
        className="d-flex align-items-center gap-2"
        style={{ marginBottom: spacing[100] }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: typeColor,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {log.type}
        </span>
        <span style={{ color: palette.gray.light1, fontSize: 13 }}>
          {log.timestamp}
        </span>
      </div>
      <p
        style={{
          fontSize: 14,
          color: palette.gray.light2,
          fontFamily: log.type === "tool" ? "monospace" : "inherit",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {log.message}
      </p>
    </div>
  );
}
