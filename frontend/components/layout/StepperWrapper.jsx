"use client";

import { useDispatch, useSelector } from "react-redux";
import { setCurrentStep } from "../../redux/slices/GlobalSlice";

const MG = "var(--mg-green)";

const STEPS = [
  "External Conditions",
  "Identify affected suppliers",
  "Search for alternative suppliers",
];

const PHASES = [
  { label: "Phase 1", cols: 2, color: MG },
  { label: "Phase 2", cols: 1, color: "#9ca3af" },
];

export default function StepperWrapper() {
  const dispatch = useDispatch();
  const currentStep = useSelector((s) => s.Global.currentStep);
  const maxStep = useSelector((s) => s.Global.maxStep);

  const fillPct = currentStep === 1 ? 0 : currentStep === 2 ? 50 : 100;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        padding: "24px 32px 20px",
        marginBottom: 24,
      }}
    >
      {/* Steps row */}
      <div style={{ display: "flex", alignItems: "flex-start", position: "relative" }}>
        {/* Track */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "calc(16.5% + 16px)",
            right: "calc(16.5% + 16px)",
            height: 2,
            background: "#e5e7eb",
            zIndex: 0,
          }}
        />
        {/* Fill */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "calc(16.5% + 16px)",
            height: 2,
            background: MG,
            zIndex: 1,
            width: `${fillPct}%`,
            transition: "width 0.4s ease",
          }}
        />

        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < currentStep;
          const active = step === currentStep;
          const clickable = step <= maxStep;

          return (
            <div
              key={step}
              onClick={() => clickable && dispatch(setCurrentStep(step))}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                position: "relative",
                zIndex: 2,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  border: `2px solid ${done || active ? MG : "#d1d5db"}`,
                  background: done ? MG : active ? "#fff" : "#f9fafb",
                  color: done ? "#fff" : active ? MG : "#9ca3af",
                  transition: "all 0.3s ease",
                }}
              >
                {done ? "✓" : step}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: active || done ? 600 : 400,
                  color: active ? MG : done ? "#374151" : "#9ca3af",
                  textAlign: "center",
                  maxWidth: 120,
                  lineHeight: 1.3,
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Phase braces */}
      <div
        style={{
          display: "flex",
          marginTop: 12,
          paddingTop: 4,
          borderTop: "1px dashed #e5e7eb",
        }}
      >
        {PHASES.map((phase) => (
          <div
            key={phase.label}
            className="d-flex flex-column align-items-center mt-1 gap-4 pt-2 pb-2"
            style={{flex: phase.cols }}
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
