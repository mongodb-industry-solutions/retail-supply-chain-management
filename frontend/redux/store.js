import { configureStore } from '@reduxjs/toolkit';
import GlobalReducer from './slices/GlobalSlice';


const store = configureStore({
    reducer: {
        Global: GlobalReducer,
    }
});

export default store;
