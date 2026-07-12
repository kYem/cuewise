import { vi } from 'vitest';

// Mock plumbing for posture-controller tests: shared spies handed to the
// controller's mocked deps (Tauri invoke/listen, toast store, notifier).

export type EventHandler = (event: { payload: string }) => void;

/** Tauri event handlers captured by the mocked `listen`, keyed by event name. */
export const capturedHandlers = new Map<string, EventHandler>();
export const unlistenSpies: Array<ReturnType<typeof vi.fn>> = [];

export const invokeMock = vi.fn();
export const toastErrorMock = vi.fn();
export const toastWarningMock = vi.fn();
export const notifyMock = vi.fn();

/** Mutable stand-ins for the pomodoro / focus-mode store snapshots (Smart Pause). */
export const pomodoroStateMock = { status: 'idle', sessionType: 'work' };
export const focusModeStateMock = { isActive: false };

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
  notifyMock.mockReset();
  notifyMock.mockResolvedValue(undefined);
  pomodoroStateMock.status = 'idle';
  pomodoroStateMock.sessionType = 'work';
  focusModeStateMock.isActive = false;
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

// User-facing messages asserted on — must mirror posture-controller.ts.
export const STOPPED_ERROR = 'Posture tracking stopped — camera unavailable or permission denied.';
export const UNREADABLE_ERROR = 'Posture readings could not be read.';
export const START_FAILED_ERROR = 'Could not start posture tracking — check camera access.';

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

export function emitStopped(): void {
  getHandler('posture://stopped')({ payload: '' });
}

export function countInvokes(command: string): number {
  return invokeMock.mock.calls.filter(([invoked]) => invoked === command).length;
}

/** Mirrors the controller's nudge threshold: consecutive poor samples before a nudge. */
export const NUDGE_AFTER_POOR_SAMPLES = 15;

export function emitPoorFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    emitSampleFrame(JSON.stringify({ status: 'poor' }));
  }
}
