"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@leafygreen-ui/card";
import { Body, Overline } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import SectionHeader from "./SectionHeader";
import AgentAvatar from "./AgentAvatar";

function buildDisplayItems(events) {
  const items = [];

  for (const event of events) {
    const eventType = event.type || event.event;
    if(eventType === "layer_started"){
      items.push({ type: "layer", message: event.label, status: "running" });
    } else if(eventType === "layer_completed"){
      items.push({ type: "layer", message: event.summary, status: "completed" });
    }
    if (eventType === "tool_start") {
      const message = event.message || event.tool;
      items.push({ type: "step", message: message, status: "running", args: event.args || null });
    } else if (eventType === "tool_end") {
      const message = event.message || event.tool;
      const idx = items.findIndex(
        (i) => i.type === "step" && i.message === message && i.status === "running"
      );
      if (idx !== -1) items[idx] = { ...items[idx], status: "completed" };
    } else if(eventType === "error") {
      items.push({ type: "step", message: `Error: ${event.message}`, status: "error" });
    }
  }

  return items;
}

export default function ReActAgent({
  phases,
  agentCurrentThought = "ReAct Agent",
  title,
  subtitle,
  onComplete,
  onDoneChange,
  onViewLogs,
  // When provided, this is the source of truth for completion (owned by Redux).
  // Completion criteria differ per step (Step 2: "agent_response", Step 3:
  // "shortlist_ready"), so callers decide when the agent is done. When omitted,
  // we fall back to deriving it from the phase/step statuses.
  done,
}) {
  const hasLiveEvents = phases?.some((p) => p.steps?.length > 0);
  const completedRef = useRef(false);

  const derivedDone = hasLiveEvents
    ? phases.every((p) => {
        const steps = buildDisplayItems(p.steps ?? []).filter((i) => i.type === "step");
        return steps.length > 0 && steps.every((i) => i.status === "completed" || i.status === "error");
      })
    : false;

  const isDone = done ?? derivedDone;

  useEffect(() => {
    if (isDone && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [isDone, onComplete]);

  useEffect(() => {
    onDoneChange?.(isDone);
  }, [isDone, onDoneChange]);

  // Fallback: timer-driven animation when no live events yet
  const allSteps = phases.flatMap((p) => p.steps);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [completedSet, setCompletedSet] = useState(new Set());
  const [timerDone, setTimerDone] = useState(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasLiveEvents) return; // live events take over, skip timer
    if (hasStarted.current) return;
    hasStarted.current = true;

    let stepIndex = 0;
    const runStep = () => {
      if (stepIndex >= allSteps.length) {
        setTimerDone(true);
        onComplete?.();
        return;
      }
      const current = stepIndex;
      setCurrentIndex(current);
      setTimeout(() => {
        setCompletedSet((prev) => new Set([...prev, current]));
        stepIndex++;
        setTimeout(runStep, 200);
      }, 1100);
    };
    setTimeout(runStep, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showDone = done ?? (hasLiveEvents ? isDone : timerDone);

  return (
    <>
      <SectionHeader title={title} subtitle={subtitle} />
      <Card style={{ marginBottom: spacing[400] }} onClick={() => console.log('REDUX: alternativeSuppliersAgentReasoning', phases )}>
        <div className="d-flex gap-4 align-items-start">
          <AgentAvatar agentCurrentThought={agentCurrentThought} idle={showDone} />

          <div style={{ flex: 1 }}>
            {hasLiveEvents ? (
              // Live event-driven rendering — one row per phase
              <div className="d-flex flex-column">
                {phases.map((phase, phaseIdx) => {
                  const items = buildDisplayItems(phase.steps ?? []);
                  return (
                    <div
                      key={phaseIdx}
                      style={
                        phaseIdx > 0
                          ? { borderTop: `1px solid ${palette.gray.light2}`, paddingTop: spacing[400], marginTop: spacing[400] }
                          : {}
                      }
                    >
                      <Overline
                        style={{
                          display: "block",
                          marginBottom: spacing[200],
                          paddingBottom: spacing[100],
                          borderBottom: `1px solid ${palette.gray.light2}`,
                          color: palette.gray.dark1,
                        }}
                      >
                        {phaseIdx+1}. {phase.name}
                      </Overline>

                      <div className="d-flex flex-column" style={{ gap: 6 }}>
                        {items.map((item, i) => {
                          if (item.type === "step" || item.type === "layer") {
                            const isRunning = item.type === "step" && item.status === "running";
                            const isCompleted = item.type === "step" && item.status === "completed";
                            const isError = item.type === "step" && item.status === "error";
                            const isLayerStart = item.type === "layer" && item.status === "running";
                            const isLayerCompleted = item.type === "layer" && item.status === "completed";
                            return (
                              <div key={i} className="d-flex gap-2">
                                <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>
                                  {
                                    isCompleted ? (
                                      <Icon glyph="CheckmarkWithCircle" color={palette.green.dark1} />
                                    ) : isError ? (
                                      <Icon glyph="NotAllowed" color={palette.red.dark2} />
                                    ) : isRunning ?(
                                      <Icon glyph="Clock" color={palette.gray.base} />
                                    ) : isLayerStart ?(
                                      <Icon glyph="Pending" color={palette.green.dark1} />
                                    ) : isLayerCompleted ?(
                                      <Icon glyph="Circle" color={palette.green.dark1} />
                                    ) : (
                                      "○"
                                    )
                                  }
                                </span>
                                <Body
                                  style={{
                                    fontSize: 14,
                                    color: (isCompleted || isLayerStart || isLayerCompleted) ? palette.gray.dark3 : palette.gray.dark2,
                                    fontWeight: isRunning ? 600 : 400,
                                    margin: 0,
                                  }}
                                >
                                  {
                                    item.args && item.args !== null
                                    ? `${item.message} for ${item.args.criterion} on ${item.args.supplier_id}`
                                    : item.message
                                  }
                                </Body>
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Timer-driven fallback rendering
              <div className="d-flex flex-column">
                {phases.map((phase, phaseIdx) => {
                  const offset = phases
                    .slice(0, phaseIdx)
                    .reduce((acc, p) => acc + p.steps.length, 0);

                  return (
                    <div
                      key={phaseIdx}
                      style={
                        phaseIdx > 0
                          ? { borderTop: `1px solid ${palette.gray.light2}`, paddingTop: spacing[400], marginTop: spacing[400] }
                          : {}
                      }
                    >
                      <Overline
                        style={{
                          display: "block",
                          marginBottom: spacing[200],
                          paddingBottom: spacing[100],
                          borderBottom: `1px solid ${palette.gray.light2}`,
                          color: palette.gray.dark1,
                        }}
                      >
                        {phase.name}
                      </Overline>

                      {phase.steps.map((step, stepIdx) => {
                        const flatIdx = offset + stepIdx;
                        const isCompleted = completedSet.has(flatIdx);
                        const isCurrent = currentIndex === flatIdx && !isCompleted;

                        return (
                          <div key={stepIdx} className="d-flex align-items-center gap-2 mb-2">
                            <span style={{ width: 20, textAlign: "center", fontSize: 15, flexShrink: 0 }}>
                              {isCompleted ? (
                                <Icon color="green" glyph="CheckmarkWithCircle" />
                              ) : isCurrent ? (
                                <Icon glyph="Clock" />
                              ) : (
                                "○"
                              )}
                            </span>
                            <Body
                              style={{
                                fontSize: 14,
                                color: isCompleted
                                  ? palette.gray.dark3
                                  : isCurrent
                                  ? palette.gray.dark2
                                  : palette.gray.base,
                                fontWeight: isCurrent ? 600 : 400,
                                margin: 0,
                              }}
                            >
                              {step}
                            </Body>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            { onViewLogs ? (
              <Button
                size="small"
                variant="default"
                leftGlyph={<Icon glyph="List" />}
                onClick={onViewLogs}
                className="mt-3"
                disabled={!showDone}
              >
                View Logs
              </Button>
            ) : null}
          </div>
        </div>

        {!showDone && agentCurrentThought && agentCurrentThought !== "ReAct Agent" && (
          <div
            style={{
              marginTop: spacing[300],
              paddingTop: spacing[300],
              borderTop: `1px solid ${palette.gray.light2}`,
              display: "flex",
              alignItems: "flex-start",
              gap: spacing[200],
            }}
          >
            <Icon glyph="SMS" style={{ flexShrink: 0, marginTop: 2 }} color={palette.gray.dark1} />
            <Body
              style={{
                fontSize: 13,
                color: palette.gray.dark2,
                fontStyle: "italic",
                margin: 0,
              }}
            >
              {agentCurrentThought}
            </Body>
          </div>
        )}
      </Card>
    </>
  );
}
