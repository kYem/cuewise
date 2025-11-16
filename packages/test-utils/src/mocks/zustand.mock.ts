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
