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
  notifyMock,
  pomodoroStateMock,
  resetPostureMocks,
  START_FAILED_ERROR,
  STOPPED_ERROR,
  toastErrorMock,
  UNREADABLE_ERROR,
  unlistenSpies,
} from './__fixtures__/posture-controller.fixtures';
import {
  getPostureState,
  NUDGE_AFTER_POOR_SAMPLES,
  startPosture,
  stopPosture,
} from './posture-controller';

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

let localStorageStub: ReturnType<typeof createLocalStorageStub>;
// Each test starts on a fresh clock well past the previous test's nudge, so the
// module-level nudge cooldown can never bleed across tests.
let clock = Date.now();

// One zero-length tick drains the attach-listeners → invoke promise chain.
async function flushChain(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

async function startTracking(): Promise<void> {
  startPosture();
  await flushChain();
  expect(countInvokes('start_posture')).toBe(1);
  expect(getPostureState().tracking).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
  resetPostureMocks();
  localStorageStub = createLocalStorageStub();
  vi.stubGlobal('localStorage', localStorageStub);
});

afterEach(async () => {
  // The controller keeps module-level session state — tear it down so each
  // test starts from idle.
  stopPosture();
  await flushChain();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('posture controller lifecycle', () => {
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
    await flushChain();

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
  it('nudges after sustained poor posture when no focus session is running', async () => {
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'posture-nudge' }));
  });

  it('never nudges while a work session is running', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'work';
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a focus block resets a pre-focus streak — no stale nudge when the session ends', async () => {
    await startTracking();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1); // one frame short of a nudge

    pomodoroStateMock.status = 'running';
    emitPoorFrames(1); // suppressed, and must reset (not freeze) the streak
    pomodoroStateMock.status = 'idle';

    emitPoorFrames(1);
    // A frozen streak would fire right here (14 pre-focus + 1) — reset must not.
    expect(notifyMock).not.toHaveBeenCalled();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'posture-nudge' }));
  });

  it('still nudges during a break when the focus-mode surface is not open', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'break';
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'posture-nudge' }));
  });

  it('never nudges while the focus-mode surface is open, even with the timer idle', async () => {
    focusModeStateMock.isActive = true;
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
