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
    affectedSuppliersAgentReasoning: [],
    affectedSuppliersAgentCurrentThought: "",
    selectedAlertType: "logistical",
    // Step 3
    selectedSupplier: null,
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
      state.selectedSupplier = action.payload;
    },
    setSelectedAlertType(state, action) {
      state.selectedAlertType = action.payload;
    },
    appendAffectedSuppliersAgentReasoning(state, action) {
      console.log("[appendAffectedSuppliersAgentReasoning]", action.payload);
      state.affectedSuppliersAgentReasoning.push(action.payload);
      if (action.payload.type === "agent_thought") {
        state.affectedSuppliersAgentCurrentThought = action.payload.message;
      }
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
  setSelectedAlertType,
  appendAffectedSuppliersAgentReasoning
} = GlobalSlice.actions;

export default GlobalSlice.reducer;
