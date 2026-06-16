"use client";

import { useSelector } from "react-redux";
import Step1 from "../components/step1/Step1";
import Step2 from "../components/step2/Step2";

export default function Home() {
  const currentStep = useSelector((s) => s.Global.currentStep);

  return (
    <div className="mt-3">
      {currentStep === 1 && <Step1 />}
      {currentStep === 2 && <Step2 />}
      {currentStep === 3 && <div>Step 3 — coming soon</div>}
    </div>
  );
}
