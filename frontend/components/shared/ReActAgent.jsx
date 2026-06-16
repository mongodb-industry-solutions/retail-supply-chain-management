"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@leafygreen-ui/card";
import { Body } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { Badge } from "@leafygreen-ui/badge";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import SectionHeader from "./SectionHeader";
import AgentAvatar from "./AgentAvatar";

const STEP_DELAY_MS = 1100;
const STEP_GAP_MS = 200;

export default function ReActAgent({
  steps,
  title,
  subtitle,
  onComplete,
  onViewLogs,
}) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [completedSet, setCompletedSet] = useState(new Set());
  const [isDone, setIsDone] = useState(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let stepIndex = 0;
    const runStep = () => {
      if (stepIndex >= steps.length) {
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
      <SectionHeader
        title={title}
        subtitle={subtitle}
      />
      <Card style={{ marginBottom: spacing[400] }}>
        <div className="d-flex gap-4 align-items-start">
          <AgentAvatar idle={isDone} />

          <div style={{ flex: 1 }}>
            {steps.map((step, i) => {
              const isCompleted = completedSet.has(i);
              const isCurrent = currentIndex === i && !isCompleted;

              return (
                <div
                  key={i}
                  className="d-flex align-items-center gap-2 mb-2"
                >
                  <span
                    style={{
                      width: 20,
                      textAlign: "center",
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {isCompleted ? <Icon color="green" glyph="CheckmarkWithCircle" /> : isCurrent ? <Icon glyph="Clock" /> : "○"}
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
              )
            })}
            {isDone && onViewLogs ? (
              <Button
                size="small"
                variant="default"
                leftGlyph={<Icon glyph="List" />}
                onClick={onViewLogs}
                className="mt-2"
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
