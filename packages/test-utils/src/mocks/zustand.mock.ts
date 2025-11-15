import type { StateCreator } from 'zustand';
import { act } from '@testing-library/react';

// Store reset functions
const storeResetFns = new Set<() => void>();

// Reset all stores (call in afterEach)
export const resetAllStores = () => {
  act(() => {
    storeResetFns.forEach((resetFn) => {
      resetFn();
    });
  });
};

// Create a store with reset capability
export const createTestStore = <T,>(store: any, initialState: T) => {
  storeResetFns.add(() => {
    store.setState(initialState, true);
  });

  return store;
};
