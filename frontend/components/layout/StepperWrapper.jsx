"use client";

import { useDispatch, useSelector } from "react-redux";
import { Stepper, Step } from "@leafygreen-ui/stepper";
import { palette } from "@leafygreen-ui/palette";
import { setCurrentStep } from "../../redux/slices/GlobalSlice";

const STEPS = [
  "External Conditions",
  "Identify affected suppliers",
  "Search for alternative suppliers",
];

const PHASES = [
  { label: "Phase 1", cols: 2, color: palette.green.dark2 },
  { label: "Phase 2", cols: 1, color: palette.gray.base },
];

export default function StepperWrapper() {
  const dispatch = useDispatch();
  const currentStep = useSelector((s) => s.Global.currentStep);
  const maxStep = useSelector((s) => s.Global.maxStep);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: `1px solid ${palette.gray.light2}`,
        padding: "24px 32px 20px",
        marginBottom: 24,
      }}
    >
      <Stepper currentStep={currentStep - 1}>
        {STEPS.map((label, i) => {
          const step = i + 1;
          const clickable = step <= maxStep && step !== currentStep;
          return (
            <Step key={step}>
              <span
                style={{ cursor: clickable ? "pointer" : "default" }}
                onClick={() => clickable && dispatch(setCurrentStep(step))}
              >
                {label}
              </span>
            </Step>
          );
        })}
      </Stepper>

      {/* Phase braces */}
      <div
        style={{
          display: "flex",
          marginTop: 12,
          paddingTop: 4,
          borderTop: `1px dashed ${palette.gray.light2}`,
        }}
      >
        {PHASES.map((phase) => (
          <div
            key={phase.label}
            className="d-flex flex-column align-items-center gap-1 pt-2 pb-2"
            style={{ flex: phase.cols }}
          >
            <div
              style={{
                width: "60%",
                height: 2,
                background: phase.color,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: phase.color,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {phase.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
