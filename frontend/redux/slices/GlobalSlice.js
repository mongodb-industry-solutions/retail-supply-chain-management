import { createSlice } from "@reduxjs/toolkit";

const GlobalSlice = createSlice({
  name: "Global",
  initialState: {
    currentStep: 1,
    maxStep: 1,
    loadedExternalConditions: [],
    selectedSupplier: null,
    selectedAlertType: "logistical",
  },
  reducers: {
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
    setSelectedSupplier(state, action) {
      state.selectedSupplier = action.payload;
    },
    setSelectedAlertType(state, action) {
      state.selectedAlertType = action.payload;
    },
  },
});

export const {
  setCurrentStep,
  setMaxStep,
  advanceToStep,
  setLoadedExternalConditions,
  setSelectedSupplier,
  setSelectedAlertType,
} = GlobalSlice.actions;

export default GlobalSlice.reducer;
