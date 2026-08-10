"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@leafygreen-ui/card";
import { Body, Overline } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import Tooltip from "@leafygreen-ui/tooltip";
import SectionHeader from "./SectionHeader";
import AgentAvatar from "./AgentAvatar";

// One symbol per step state, so the icon column has a single meaning.
// Layer rows are rendered as sub-headings instead of competing for this column.
const STEP_STATUS = {
  running: { glyph: "Clock", color: palette.gray.base, label: "Running" },
  completed: {
    glyph: "CheckmarkWithCircle",
    color: palette.green.dark1,
    label: "Completed",
  },
  error: { glyph: "NotAllowed", color: palette.red.dark2, label: "Failed" },
  pending: { glyph: "Ellipsis", color: palette.gray.light1, label: "Not started yet" },
};

function StepIcon({ status }) {
  const cfg = STEP_STATUS[status] ?? STEP_STATUS.running;
  return (
    <Tooltip
      trigger={
        <span
          role="img"
          aria-label={cfg.label}
          className="d-inline-flex justify-content-center"
          style={{ width: 20, flexShrink: 0 }}
        >
          <Icon glyph={cfg.glyph} color={cfg.color} />
        </span>
      }
    >
      {cfg.label}
    </Tooltip>
  );
}

function buildDisplayItems(events) {
  const items = [];

  for (const event of events) {
    const eventType = event.type || event.event;
    if(eventType === "layer_started"){
      items.push({ type: "layer", message: event.label, status: "running" });
    } else if(eventType === "layer_completed"){
      // Complete the open layer row in place (clock -> check) rather than
      // leaving it running forever, then close the layer out with its summary
      // as the last row, so the summary always lands after the tool steps.
      const idx = items.findLastIndex(
        (i) => i.type === "layer" && i.status === "running"
      );
      if (idx !== -1) items[idx] = { ...items[idx], status: "completed" };
      if (event.summary) {
        items.push({ type: "summary", message: event.summary, status: "completed" });
      }
    } else if (eventType === "tool_start") {
      const message = event.message || event.tool;
      items.push({ type: "step", message: message, status: "running", args: event.args || null });
    } else if (eventType === "tool_end") {
      const message = event.message || event.tool;
      const idx = items.findIndex(
        (i) => i.type === "step" && i.message === message && i.status === "running"
      );
      if (idx !== -1) items[idx] = { ...items[idx], status: "completed" };
    } else if(eventType === "error") {
      // Fail the phase row that was still running, so it stops showing a clock
      const idx = items.findLastIndex(
        (i) => i.type === "layer" && i.status === "running"
      );
      if (idx !== -1) items[idx] = { ...items[idx], status: "error" };
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
      <Card style={{ marginBottom: spacing[400], cursor: 'auto' }}>
        <div className="d-flex gap-4 align-items-start" onClick={() => console.log('REDUX: alternativeSuppliersAgentReasoning', phases )}>
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
                      {/* A phase with no name is an unlabelled single phase —
                          render its rows without a heading or divider. */}
                      {phase.name ? (
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
                      ) : null}

                      <div className="d-flex flex-column" style={{ gap: 6 }}>
                        {items.map((item, i) => {
                          // Flat list within the phase: layer rows, tool steps
                          // and the closing summary all share one icon column
                          // and one vocabulary (clock = running, green check =
                          // done, red = failed). No indentation or markers, so
                          // nothing implies a hierarchy that isn't there.
                          if (
                            item.type !== "layer" &&
                            item.type !== "step" &&
                            item.type !== "summary"
                          ) {
                            return null;
                          }

                          const isRunning = item.status === "running";
                          return (
                            <div key={i} className="d-flex gap-2">
                              <StepIcon status={item.status} />
                              <Body
                                weight={item.type === "summary" ? "medium" : "regular"}
                                style={{
                                  fontSize: 14,
                                  color:
                                    item.status === "error"
                                      ? palette.red.dark2
                                      : item.status === "completed"
                                        ? palette.gray.dark3
                                        : palette.gray.dark2,
                                  wordBreak:
                                    item.status === "error" ? "break-word" : undefined,
                                  fontWeight: isRunning ? 600 : undefined,
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
                      {phase.name ? (
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
                      ) : null}

                      {phase.steps.map((step, stepIdx) => {
                        const flatIdx = offset + stepIdx;
                        const isCompleted = completedSet.has(flatIdx);
                        const isCurrent = currentIndex === flatIdx && !isCompleted;

                        return (
                          <div key={stepIdx} className="d-flex align-items-center gap-2 mb-2">
                            <StepIcon
                              status={
                                isCompleted ? "completed" : isCurrent ? "running" : "pending"
                              }
                            />
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
