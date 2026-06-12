"use client";

import Card from "@leafygreen-ui/card";
import { spacing } from "@leafygreen-ui/tokens";
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
