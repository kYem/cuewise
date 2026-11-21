import { vi } from 'vitest';

/** Stubs window.matchMedia so every query resolves to `matches`; returns the change listeners. */
export function stubMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return listeners;
}
