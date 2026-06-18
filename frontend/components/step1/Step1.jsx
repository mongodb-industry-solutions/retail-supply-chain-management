"use client";

import SimulationPanel from "./SimulationPanel";
import DashboardAtlasCharts from "./DashboardAtlasCharts";
import HowExternalConditionsGenerated from "./HowExternalConditionsGenerated";

export default function Step1() {
  return (
    <div>
      <SimulationPanel />
      <DashboardAtlasCharts />
      <HowExternalConditionsGenerated />
    </div>
  );
}
