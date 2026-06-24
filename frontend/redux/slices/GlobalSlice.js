import { createSlice } from "@reduxjs/toolkit";

const GlobalSlice = createSlice({
  name: "Global",
  initialState: {
    sessionId: null,
    externalConditions: [],
    currentStep: 1,
    maxStep: 1,
    loadedExternalConditions: [],
    affectedSuppliers: [],
    selectedSupplier: null,
    selectedAlertType: "logistical",
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
} = GlobalSlice.actions;

export default GlobalSlice.reducer;
