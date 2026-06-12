"use client";

import { useSelector } from "react-redux";

export default function Home() {
  const currentStep = useSelector((s) => s.Global.currentStep);

  return (
    <div>
      {currentStep === 1 && <div>Step 1 — coming soon</div>}
      {currentStep === 2 && <div>Step 2 — coming soon</div>}
      {currentStep === 3 && <div>Step 3 — coming soon</div>}
    </div>
  );
}
