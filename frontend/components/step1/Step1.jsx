"use client";
import { affectedSupList, altAsupAgentReason } from "@/data/alternatives";
import SimulationPanel from "./SimulationPanel";
import DashboardAtlasCharts from "./DashboardAtlasCharts";
import HowExternalConditionsGenerated from "./HowExternalConditionsGenerated";
import LogDrawer from "../shared/LogDrawer";

export default function Step1() {
  return (
    <div>
      <SimulationPanel />
      <DashboardAtlasCharts />
      <HowExternalConditionsGenerated />
      <LogDrawer
        show={true}
        onHide={() => {}}
        title="Agent Execution Logs"
        subtitle="ReAct Agent powered by LangGraph + MongoDB Atlas"
        phases={altAsupAgentReason}
      />
    </div>
  );
}
