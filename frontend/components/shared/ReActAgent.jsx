"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@leafygreen-ui/card";
import { Body, Overline } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { MongoDBLogoMark } from "@leafygreen-ui/logo";
import SectionHeader from "./SectionHeader";
import AgentAvatar from "./AgentAvatar";

function buildDisplayItems(events) {
  const items = [];

  for (const event of events) {
    if (event.type === "tool_start") {
      items.push({ type: "step", message: event.message, status: "running" });
    } else if (event.type === "tool_end") {
      const idx = items.findIndex(
        (i) => i.type === "step" && i.message === event.message && i.status === "running"
      );
      if (idx !== -1) items[idx] = { ...items[idx], status: "completed" };
    } else if (event.type === "atlas_operation") {
      items.push({
        type: "atlas",
        text: `${event.feature} on ${event.collection}: ${event.detail}`,
      });
    }
  }

  return items;
}

export default function ReActAgent({
  phases,
  phasesNew,
  agentCurrentThought = "ReAct Agent",
  title,
  subtitle,
  onComplete,
  onDoneChange,
  onViewLogs,
}) {
  const hasLiveEvents = phasesNew?.some((p) => p.steps?.length > 0);
  const completedRef = useRef(false);

  const isDone = hasLiveEvents
    ? phasesNew.every((p) => {
        const steps = buildDisplayItems(p.steps ?? []).filter((i) => i.type === "step");
        return steps.length > 0 && steps.every((i) => i.status === "completed");
      })
    : false;

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

  const showDone = hasLiveEvents ? isDone : timerDone;

  return (
    <>
      <SectionHeader title={title} subtitle={subtitle} />
      <Card style={{ marginBottom: spacing[400] }}>
        <div className="d-flex gap-4 align-items-start">
          <AgentAvatar agentCurrentThought={agentCurrentThought} idle={showDone} />

          <div style={{ flex: 1 }}>
            {hasLiveEvents ? (
              // Live event-driven rendering — one column per phase
              <div className="row g-0">
                {phasesNew.map((phase, phaseIdx) => {
                  const items = buildDisplayItems(phase.steps ?? []);
                  return (
                    <div
                      key={phaseIdx}
                      className="col"
                      style={
                        phaseIdx > 0
                          ? { borderLeft: `1px solid ${palette.gray.light2}`, paddingLeft: spacing[400] }
                          : { paddingRight: spacing[400] }
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

                      <div className="d-flex flex-column" style={{ gap: 6 }}>
                        {items.map((item, i) => {
                          if (item.type === "step") {
                            const isRunning = item.status === "running";
                            const isCompleted = item.status === "completed";
                            return (
                              <div key={i} className="d-flex align-items-center gap-2">
                                <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>
                                  {isCompleted ? (
                                    <Icon glyph="CheckmarkWithCircle" color={palette.green.dark1} />
                                  ) : (
                                    <Icon glyph="Clock" color={palette.gray.base} />
                                  )}
                                </span>
                                <Body
                                  style={{
                                    fontSize: 14,
                                    color: isCompleted ? palette.gray.dark3 : palette.gray.dark2,
                                    fontWeight: isRunning ? 600 : 400,
                                    margin: 0,
                                  }}
                                >
                                  {item.message}
                                </Body>
                              </div>
                            );
                          }

                          if (item.type === "atlas") {
                            return (
                              <div key={i} className="d-flex align-items-center gap-2" style={{ paddingLeft: 2 }}>
                                <MongoDBLogoMark height={16} style={{ flexShrink: 0 }} />
                                <Body style={{ fontSize: 13, color: palette.gray.dark1, margin: 0 }}>
                                  {item.text}
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
              <div className="row g-0">
                {phases.map((phase, phaseIdx) => {
                  const offset = phases
                    .slice(0, phaseIdx)
                    .reduce((acc, p) => acc + p.steps.length, 0);

                  return (
                    <div
                      key={phaseIdx}
                      className="col"
                      style={
                        phaseIdx > 0
                          ? { borderLeft: `1px solid ${palette.gray.light2}`, paddingLeft: spacing[400] }
                          : { paddingRight: spacing[400] }
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
