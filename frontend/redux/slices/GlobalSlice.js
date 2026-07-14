import { alternativeLayers } from "@/data/alternatives";
import { createSlice } from "@reduxjs/toolkit";

const GlobalSlice = createSlice({
  name: "Global",
  initialState: {
    sessionId: null,
    currentStep: 1,
    maxStep: 1,
    // Step 1
    externalConditions: [],
    loadedExternalConditions: [],
    // Step 2
    affectedSuppliers: [],
    affectedSuppliersAgentReasoning: [], // events
    affectedSuppliersAgentCurrentThought: "",
    // Step 3
    selectedSupplier: null,
    selectedSupplierAlertTypes: [], // i.e ["logistics_disruption", "geopolitical_tariff"]
    alternativeSuppliers: [],
    alternativeSuppliersAgentReasoning: alternativeLayers.map(layer => ({ name: layer, steps: [] })), // events
    alternativeSuppliersAgentCurrentThought: "",
  },
  reducers: {
    setSessionId(state, action) {
      state.sessionId = action.payload;
    },
    setExternalConditions(state, action) {
      state.externalConditions = action.payload;
    },
    setCurrentStep(state, action) {
      state.currentStep = action.payload;
    },
    setMaxStep(state, action) {
      state.maxStep = action.payload;
    },
    advanceToStep(state, action) {
      const step = action.payload;
      state.currentStep = step;
      if (step > state.maxStep) state.maxStep = step;
    },
    setLoadedExternalConditions(state, action) {
      state.loadedExternalConditions = action.payload;
    },
    setAffectedSuppliers(state, action) {
      state.affectedSuppliers = action.payload;
    },
    setSelectedSupplier(state, action) {
      state.selectedSupplier = { ...action.payload, supplier_id: "EVAL-test-ris-EN-441-1783442252" }; //action.payload;
      state.selectedSupplierAlertTypes = action.payload.risk_scores.map(risk => risk.triggered_by.risk_type_triggered);
      state.alternativeSuppliers = [];
      state.alternativeSuppliersAgentReasoning = alternativeLayers.map(layer => ({ name: layer, steps: [] })); // events
      state.alternativeSuppliersAgentCurrentThought = "";
    },
    appendAffectedSuppliersAgentReasoning(state, action) {
      console.log("[appendAffectedSuppliersAgentReasoning]", action.payload);
      const payloadKey = JSON.stringify(action.payload);
      // TODO: remove once backend stops emitting duplicate SSE events for the same step
      const isDuplicate = state.affectedSuppliersAgentReasoning.some((entry) => {
        const { time: _time, ts: _ts, ...rest } = entry;
        return JSON.stringify(rest) === payloadKey;
      });
      if (isDuplicate) return;
      if( state.affectedSuppliersAgentReasoning[state.affectedSuppliersAgentReasoning.length - 1]?.type === "agent_response" 
        && action.payload.type === "agent_response")
        return
      
      const now = new Date();
      const time = now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      state.affectedSuppliersAgentReasoning.push({
        ...action.payload,
        time,
        ts: now.getTime(),
      });
      if (action.payload.type === "agent_thought") {
        state.affectedSuppliersAgentCurrentThought = action.payload.message;
      }
    },
    appendAlternativeSuppliersAgentReasoning(state, action) {
      console.log("[appendAlternativeSuppliersAgentReasoning]", action.payload);
      const time = action.payload.timestamp
        ? new Date(action.payload.timestamp).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })
        : undefined;
      const data = {
        ...action.payload,
        time
      };
      console.log("[appendAlternativeSuppliersAgentReasoning] data.layer !== null", data.layer !== null);
      if(data.layer !== null)
        state.alternativeSuppliersAgentReasoning[data.layer].steps.push(data);
      else if (data.event== "alternative_finder_started" || data.event == "stream_end")
        console.log("[appendAlternativeSuppliersAgentReasoning] ignoring event without layer", data);
      ///// AQUI EVALUAR
      if ((action.payload.event || action.payload.type) === "agent_thought") {
        console.log("[appendAlternativeSuppliersAgentReasoning] agent_thought", action.payload.text);
        state.alternativeSuppliersAgentCurrentThought = action.payload.text;
      }
    },
    setAlternativeSuppliers(state, action) {
      state.alternativeSuppliers = action.payload;
    },
  },
});

export const {
  setSessionId,
  setExternalConditions,
  setCurrentStep,
  setMaxStep,
  advanceToStep,
  setLoadedExternalConditions,
  setAffectedSuppliers,
  setSelectedSupplier,
  appendAffectedSuppliersAgentReasoning,
  appendAlternativeSuppliersAgentReasoning,
  setAlternativeSuppliers,
} = GlobalSlice.actions;

export default GlobalSlice.reducer;
