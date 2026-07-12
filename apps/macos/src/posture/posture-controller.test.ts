import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countInvokes,
  createLocalStorageStub,
  ENABLED_KEY,
  emitPoorFrames,
  emitSampleFrame,
  emitStopped,
  focusModeStateMock,
  invokeMock,
  NUDGE_AFTER_POOR_SAMPLES,
  notifyMock,
  pomodoroStateMock,
  resetPostureMocks,
  START_FAILED_ERROR,
  STOPPED_ERROR,
  toastErrorMock,
  UNREADABLE_ERROR,
  unlistenSpies,
} from './__fixtures__/posture-controller.fixtures';
import { getPostureState, startPosture, stopPosture } from './posture-controller';

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
      }),
    },
    usePomodoroStore: { getState: () => fixtures.pomodoroStateMock },
    useFocusModeStore: { getState: () => fixtures.focusModeStateMock },
  };
});

vi.mock('@cuewise/shared', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    getNotifier: () => ({ notify: fixtures.notifyMock, clear: vi.fn() }),
  };
});

// One macrotask turn drains the attach-listeners → invoke promise chain.
async function flush(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function startTracking(): Promise<void> {
  startPosture();
  await flush();
  expect(countInvokes('start_posture')).toBe(1);
  expect(getPostureState().tracking).toBe(true);
}

describe('posture controller lifecycle', () => {
  let localStorageStub: ReturnType<typeof createLocalStorageStub>;

  beforeEach(() => {
    resetPostureMocks();
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal('localStorage', localStorageStub);
  });

  afterEach(async () => {
    // The controller keeps module-level session state — tear it down so each
    // test starts from idle.
    stopPosture();
    await flush();
    vi.unstubAllGlobals();
  });

  it('an unexpected sidecar stop surfaces the error and keeps the auto-resume pref', async () => {
    await startTracking();

    emitStopped();

    expect(getPostureState().tracking).toBe(false);
    expect(getPostureState().error).toBe(STOPPED_ERROR);
    expect(toastErrorMock).toHaveBeenCalledWith(STOPPED_ERROR);
    // Transient failures keep the opt-in so tracking can auto-resume next boot.
    expect(localStorageStub.getItem(ENABLED_KEY)).toBe('1');
    for (const unlisten of unlistenSpies) {
      expect(unlisten).toHaveBeenCalled();
    }
  });

  it('a manual stop clears a stale error so the tray warning does not linger', async () => {
    await startTracking();
    for (let i = 0; i < 5; i += 1) {
      emitSampleFrame('not json');
    }
    expect(getPostureState().error).toBe(UNREADABLE_ERROR);

    stopPosture();

    expect(getPostureState().tracking).toBe(false);
    expect(getPostureState().error).toBeNull();
  });

  it('a failed start surfaces a toast and clears the auto-resume pref', async () => {
    invokeMock.mockRejectedValueOnce(new Error('camera denied'));

    startPosture();
    await flush();

    expect(getPostureState().tracking).toBe(false);
    expect(getPostureState().error).toBe(START_FAILED_ERROR);
    expect(toastErrorMock).toHaveBeenCalledWith(START_FAILED_ERROR);
    // A failed start must not retry every boot — the pref is cleared.
    expect(localStorageStub.getItem(ENABLED_KEY)).toBe('0');
  });

  it('a readable frame becomes the live sample and clears any prior error', async () => {
    await startTracking();
    for (let i = 0; i < 5; i += 1) {
      emitSampleFrame('not json');
    }
    expect(getPostureState().error).toBe(UNREADABLE_ERROR);

    emitSampleFrame(JSON.stringify({ status: 'good' }));

    expect(getPostureState().sample).toMatchObject({ status: 'good' });
    expect(getPostureState().error).toBeNull();
  });
});

describe('smart pause (focus-session-aware nudging)', () => {
  let localStorageStub: ReturnType<typeof createLocalStorageStub>;
  // Each test starts on a fresh clock well past the previous test's nudge, so the
  // module-level nudge cooldown can never bleed across tests.
  let clock = Date.now();

  beforeEach(() => {
    vi.useFakeTimers();
    clock += 10 * 60_000;
    vi.setSystemTime(clock);
    resetPostureMocks();
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal('localStorage', localStorageStub);
  });

  afterEach(async () => {
    stopPosture();
    await vi.advanceTimersByTimeAsync(0);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function startTrackingFake(): Promise<void> {
    startPosture();
    await vi.advanceTimersByTimeAsync(0);
    expect(getPostureState().tracking).toBe(true);
  }

  it('nudges after sustained poor posture when no focus session is running', async () => {
    await startTrackingFake();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'posture-nudge' }));
  });

  it('never nudges while a work session is running', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'work';
    await startTrackingFake();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a focus block is neutral — the streak restarts fresh after the session ends', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'work';
    await startTrackingFake();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1);

    pomodoroStateMock.status = 'idle';
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1);
    // 28 poor frames total — a carried-over streak would have fired long ago.
    expect(notifyMock).not.toHaveBeenCalled();

    emitPoorFrames(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'posture-nudge' }));
  });

  it('still nudges during a break — only focus time is protected', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'break';
    await startTrackingFake();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'posture-nudge' }));
  });

  it('never nudges while focus mode is active, even with the timer idle', async () => {
    focusModeStateMock.isActive = true;
    await startTrackingFake();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
