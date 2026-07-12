import { expect, vi } from 'vitest';

// Mock plumbing for posture-controller tests. The controller holds module-level
// state, so tests re-import it via vi.resetModules(); these shared spies survive
// that reset because vi.mock factories hand them out again on each re-import.

export type EventHandler = (event: { payload: string }) => void;

/** Tauri event handlers captured by the mocked `listen`, keyed by event name. */
export const capturedHandlers = new Map<string, EventHandler>();
export const unlistenSpies: Array<ReturnType<typeof vi.fn>> = [];

export const invokeMock = vi.fn();
export const toastErrorMock = vi.fn();
export const toastWarningMock = vi.fn();
export const toastSuccessMock = vi.fn();
export const notifyMock = vi.fn();

/** Stand-in for `@tauri-apps/api/event`'s `listen`: captures the handler, returns an unlisten spy. */
export function listenMock(event: string, handler: EventHandler): Promise<() => void> {
  capturedHandlers.set(event, handler);
  const unlisten = vi.fn(() => {
    capturedHandlers.delete(event);
  });
  unlistenSpies.push(unlisten);
  return Promise.resolve(unlisten);
}

export function resetPostureMocks(): void {
  capturedHandlers.clear();
  unlistenSpies.length = 0;
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastWarningMock.mockReset();
  toastSuccessMock.mockReset();
  notifyMock.mockReset();
  notifyMock.mockResolvedValue(undefined);
}

/** Minimal in-memory localStorage for the node test environment. */
export function createLocalStorageStub(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

export const ENABLED_KEY = 'cuewise.posture.enabled';
export const WATCHDOG_ERROR = 'Posture tracking is not producing readings — camera turned off.';

export function getHandler(event: string): EventHandler {
  const handler = capturedHandlers.get(event);
  if (handler === undefined) {
    throw new Error(`No listener attached for ${event}`);
  }
  return handler;
}

export function emitSampleFrame(payload: string): void {
  getHandler('posture://sample')({ payload });
}

export function countInvokes(command: string): number {
  return invokeMock.mock.calls.filter(([invoked]) => invoked === command).length;
}

/** The watchdog teardown: camera stopped, error toast shown, auto-resume pref cleared. */
export function expectWatchdogFired(localStorageStub: Pick<Storage, 'getItem'>): void {
  expect(countInvokes('stop_posture')).toBe(1);
  expect(toastErrorMock).toHaveBeenCalledWith(WATCHDOG_ERROR);
  expect(localStorageStub.getItem(ENABLED_KEY)).toBe('0');
  for (const unlisten of unlistenSpies) {
    expect(unlisten).toHaveBeenCalled();
  }
}

export function expectWatchdogSilent(): void {
  expect(countInvokes('stop_posture')).toBe(0);
  expect(toastErrorMock).not.toHaveBeenCalled();
}
