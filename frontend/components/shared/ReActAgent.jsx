"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@leafygreen-ui/card";
import { Body, Overline } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import SectionHeader from "./SectionHeader";
import AgentAvatar from "./AgentAvatar";

const STEP_DELAY_MS = 1100;
const STEP_GAP_MS = 200;

export default function ReActAgent({
  phases,
  title,
  subtitle,
  onComplete,
  onViewLogs,
}) {
  const allSteps = phases.flatMap((p) => p.steps);

  const [currentIndex, setCurrentIndex] = useState(-1);
  const [completedSet, setCompletedSet] = useState(new Set());
  const [isDone, setIsDone] = useState(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let stepIndex = 0;
    const runStep = () => {
      if (stepIndex >= allSteps.length) {
        setIsDone(true);
        onComplete?.();
        return;
      }
      const current = stepIndex;
      setCurrentIndex(current);
      setTimeout(() => {
        setCompletedSet((prev) => new Set([...prev, current]));
        stepIndex++;
        setTimeout(runStep, STEP_GAP_MS);
      }, STEP_DELAY_MS);
    };

    setTimeout(runStep, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <SectionHeader title={title} subtitle={subtitle} />
      <Card style={{ marginBottom: spacing[400] }}>
        <div className="d-flex gap-4 align-items-start">
          <AgentAvatar idle={isDone} />

          <div style={{ flex: 1 }}>
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
                            {isCompleted
                              ? <Icon color="green" glyph="CheckmarkWithCircle" />
                              : isCurrent
                                ? <Icon glyph="Clock" />
                                : "○"}
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

            {isDone && onViewLogs ? (
              <Button
                size="small"
                variant="default"
                leftGlyph={<Icon glyph="List" />}
                onClick={onViewLogs}
                className="mt-3"
              >
                View Logs
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </>
  );
}
