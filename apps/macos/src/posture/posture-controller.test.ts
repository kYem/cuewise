import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countInvokes,
  createLocalStorageStub,
  emitSampleFrame,
  expectWatchdogFired,
  expectWatchdogSilent,
  resetPostureMocks,
  toastErrorMock,
} from './__fixtures__/posture-controller.fixtures';
import { startPosture, stopPosture } from './posture-controller';

vi.mock('@tauri-apps/api/core', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return { invoke: fixtures.invokeMock };
});

vi.mock('@tauri-apps/api/event', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return { listen: fixtures.listenMock };
});

vi.mock('@cuewise/app', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return {
    useToastStore: {
      getState: () => ({
        error: fixtures.toastErrorMock,
        warning: fixtures.toastWarningMock,
        success: fixtures.toastSuccessMock,
      }),
    },
  };
});

vi.mock('@cuewise/shared', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    getNotifier: () => ({ notify: fixtures.notifyMock, clear: vi.fn() }),
  };
});

const FIRST_FRAME_TIMEOUT_MS = 30_000;

async function startTracking(): Promise<void> {
  startPosture();
  // Flush the attach-listeners → invoke('start_posture') promise chain.
  await vi.advanceTimersByTimeAsync(0);
  expect(countInvokes('start_posture')).toBe(1);
}

describe('posture first-frame watchdog', () => {
  let localStorageStub: ReturnType<typeof createLocalStorageStub>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetPostureMocks();
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal('localStorage', localStorageStub);
  });

  afterEach(async () => {
    // The controller keeps module-level session state — tear the session down
    // (and let its promise chain settle) so each test starts from idle.
    stopPosture();
    await vi.advanceTimersByTimeAsync(0);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('tears the session down when the sidecar never produces a frame', async () => {
    await startTracking();

    await vi.advanceTimersByTimeAsync(FIRST_FRAME_TIMEOUT_MS);

    expectWatchdogFired(localStorageStub);
  });

  it('stands down once a readable frame arrives', async () => {
    await startTracking();

    emitSampleFrame(JSON.stringify({ status: 'good' }));
    await vi.advanceTimersByTimeAsync(FIRST_FRAME_TIMEOUT_MS * 2);

    expectWatchdogSilent();
  });

  it('stands down on an unreadable frame too — the sidecar is alive, just garbled', async () => {
    await startTracking();

    emitSampleFrame('not json');
    await vi.advanceTimersByTimeAsync(FIRST_FRAME_TIMEOUT_MS * 2);

    // A single bad frame is below the unreadable-frames escalation threshold, so
    // no error toast — and crucially no watchdog teardown.
    expectWatchdogSilent();
  });

  it('does not fire after the user stops tracking', async () => {
    await startTracking();

    stopPosture();
    await vi.advanceTimersByTimeAsync(FIRST_FRAME_TIMEOUT_MS * 2);

    // Exactly the one stop from stopPosture itself — the watchdog never added another.
    expect(countInvokes('stop_posture')).toBe(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
