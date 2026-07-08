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

export default function LogDrawer({
  show,
  onHide,
  title = "",
  subtitle = "",
  phases: logs = [],
}) {
  console.log("LogDrawer", logs);

  const listRef = useRef(null);

  useEffect(() => {
    if (!show || !listRef.current) return;
    const scrollContainer = listRef.current.closest(
      '[data-testid="log-drawer-scroll_container"]',
    );
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [show, logs.length]);

  const firstTs = logs[0]?.ts;
  const blocks = [];
  let currentGroup = null;
  logs.forEach((log) => {
    if (log.type === "tool_start") {
      currentGroup = { header: log, items: [] };
      blocks.push({ kind: "group", group: currentGroup });
    } else if (log.type === "tool_end") {
      const startTs = currentGroup?.header?.ts;
      const duration = startTs && log.ts ? (log.ts - startTs) / 1000 : null;
      currentGroup = null;
      blocks.push({ kind: "tool_end", log, duration });
    } else if (log.type === "agent_response") {
      const duration = firstTs && log.ts ? (log.ts - firstTs) / 1000 : null;
      currentGroup = null;
      blocks.push({ kind: "agent_response", log, duration });
    } else if (currentGroup) {
      currentGroup.items.push(log);
    } else {
      blocks.push({ kind: "orphan", log });
    }
  });

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
            {blocks.map((block, blockIdx) => {
              if (block.kind === "group") {
                const { header, items } = block.group;
                return (
                  <Accordion
                    key={blockIdx}
                    style={{ borderBottom: "1px solid grey" }}
                  >
                    <Accordion.Header className={`${items.length === 0 ? "no-caret" : ""}`}>
                      <div>
                        <Icon glyph="Refresh"></Icon> {header.message}
                        <br />
                        <small className="text-secondary">{header.time}</small>
                      </div>
                    </Accordion.Header>
                    {items.length > 0 && (
                      <Accordion.Body
                        style={{ background: palette.gray.light3 }}
                      >
                        <div className="d-flex flex-column gap-3">
                          {items.map((item, itemIdx) => {
                            const isThought = item.type === "agent_thought";
                            const accent = isThought
                              ? palette.blue.base
                              : palette.green.dark1;
                            return (
                              <div
                                key={itemIdx}
                                style={{
                                  background: palette.white,
                                  borderLeft: `3px solid ${accent}`,
                                  borderRadius: 6,
                                  padding: "10px 14px",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                                }}
                              >
                                <div className="d-flex justify-content-between align-items-start">
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      fontSize: 13,
                                      color: palette.gray.dark3,
                                    }}
                                  >
                                    <Icon
                                      glyph={isThought ? "SMS" : "Wrench"}
                                      size="small"
                                      fill={accent}
                                    />{" "}
                                    {isThought
                                      ? "Agent thought"
                                      : `Calling tool: ${item.feature} on ${item.collection}`}
                                  </div>
                                  <small
                                    className="text-secondary"
                                    style={{
                                      fontSize: 11,
                                      whiteSpace: "nowrap",
                                      marginLeft: spacing[300],
                                    }}
                                  >
                                    {item.time}
                                  </small>
                                </div>
                                <div
                                  style={{
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    color: palette.gray.dark2,
                                    marginTop: 6,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {isThought
                                    ? renderBoldMarkdown(item.message)
                                    : item.detail}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Accordion.Body>
                    )}
                  </Accordion>
                );
              }

              if (block.kind === "tool_end") {
                return (
                  <Accordion
                    key={blockIdx}
                    style={{ borderBottom: "1px solid grey" }}
                  >
                    <Accordion.Header className="no-caret">
                      <div>
                        <Icon color="green" glyph="CheckmarkWithCircle"></Icon>{" "}
                        {block.log.message.replace("...", "")}
                        {block.duration != null
                          ? ` - (${block.duration.toFixed(2)}s)`
                          : ""}
                        <br />
                        <small className="text-secondary">
                          {block.log.time}
                        </small>
                      </div>
                    </Accordion.Header>
                  </Accordion>
                );
              }

              if (block.kind === "agent_response") {
                const suppliers = block.log.data?.suppliers ?? [];
                const conditions = block.log.data?.conditions ?? [];
                const actionCount = suppliers.filter(
                  (s) => s.requires_action,
                ).length;

                return (
                  <div
                    key={blockIdx}
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
                        <div
                          style={{ fontSize: 12, color: palette.gray.dark1 }}
                        >
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
                      <Icon
                        glyph="Wizard"
                        fill={palette.green.dark1}
                        size="small"
                      />
                      <span>
                        Found <strong>{suppliers.length}</strong> supplier
                        {suppliers.length === 1 ? "" : "s"} exposed across{" "}
                        <strong>{conditions.length}</strong> active risk
                        condition{conditions.length === 1 ? "" : "s"}
                        {actionCount > 0 && (
                          <>
                            , <strong>{actionCount}</strong> requiring immediate
                            action
                          </>
                        )}
                        .
                      </span>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>
      </Drawer>
    </>
  );
}
