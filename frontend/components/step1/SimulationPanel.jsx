"use client";

import { useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ProgressBar } from "react-bootstrap";
import Button from "@leafygreen-ui/button";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import {
  advanceToStep,
  setLoadedExternalConditions,
} from "../../redux/slices/GlobalSlice";
import SectionHeader from "../shared/SectionHeader";
import ExternalConditionCard from "./ExternalConditionCard";
import { Card } from "@leafygreen-ui/card";

export default function SimulationPanel() {
  const dispatch = useDispatch();
  const sessionId = useSelector((s) => s.Global.sessionId);
  const externalConditions = useSelector((s) => s.Global.externalConditions);
  const loadedExternalConditions = useSelector(
    (s) => s.Global.loadedExternalConditions,
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [conditions, setConditions] = useState(() =>
    sessionId && loadedExternalConditions.length > 0
      ? loadedExternalConditions
      : [],
  );
  const [progress, setProgress] = useState(0);

  const startSimulation = useCallback(() => {
    setIsSimulating(true);
    setConditions([]);
    setProgress(0);

    const totalDuration = externalConditions.length * 600;
    const steps = 20;
    const stepInterval = totalDuration / steps;

    for (let i = 1; i <= steps; i++) {
      setTimeout(
        () => setProgress(Math.round((i / steps) * 100)),
        i * stepInterval,
      );
    }

    setTimeout(() => {
      setConditions(
        externalConditions.map((data) => ({
          ...data,
          timestamp: new Date().toISOString(),
        })),
      );
      setIsSimulating(false);
    }, totalDuration + 100);
  }, [externalConditions]);

  const handleGoToAnalysis = () => {
    dispatch(setLoadedExternalConditions(conditions));
    dispatch(advanceToStep(2));
  };

  const isDone = conditions.length > 0;
  const isIdle = !isSimulating && !isDone;

  return (
    <>
      <SectionHeader
        title="External Conditions"
        subtitle="Trigger simulated supply chain disruption conditions"
        rightElement={
          <Button
            variant="primary"
            size="large"
            disabled={isSimulating || isDone}
            onClick={startSimulation}
          >
            {isSimulating ? "Simulating..." : "▶ Start Simulation"}
          </Button>
        }
      />
      <Card className="mb-4">
        {isSimulating && (
          <div style={{ marginBottom: spacing[400] }}>
            <div className="d-flex justify-content-between mb-1">
              <Body style={{ color: palette.gray.dark1, fontSize: 12 }}>
                Receiving external conditions...
              </Body>
              <Body style={{ color: palette.gray.dark1, fontSize: 12 }}>
                {Math.round(
                  (progress / 100) * externalConditions.length,
                )}{" "}
                / {externalConditions.length}
              </Body>
            </div>
            <ProgressBar
              now={progress}
              style={{ height: 4, borderRadius: 2 }}
            />
          </div>
        )}

        {isIdle && (
          <div
            style={{
              border: `1.5px dashed ${palette.gray.light1}`,
              borderRadius: 10,
              padding: 32,
              textAlign: "center",
              color: palette.gray.base,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: spacing[200] }}>⚡</div>
            <Body style={{ color: palette.gray.base }}>
              Click &quot;Start Simulation&quot; to receive external conditions
            </Body>
          </div>
        )}

        {isDone && (
          <div>
            <div className="d-flex flex-column gap-2">
              {conditions.map((c) => (
                <ExternalConditionCard key={c.condition_id} condition={c} />
              ))}
            </div>
            <div className="d-flex justify-content-end mt-2">
              <Button
                variant="primary"
                size="large"
                onClick={handleGoToAnalysis}
              >
                Go to supplier impact analysis →
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
