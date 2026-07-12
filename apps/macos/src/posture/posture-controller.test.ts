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
  NUDGES_PAUSED_KEY,
  pomodoroStateMock,
  resetPostureMocks,
  START_FAILED_ERROR,
  STOPPED_ERROR,
  toastErrorMock,
  toastWarningMock,
  UNREADABLE_ERROR,
  unlistenSpies,
} from './__fixtures__/posture-controller.fixtures';
import {
  getPostureState,
  initPosture,
  NUDGE_AFTER_POOR_SAMPLES,
  pausePostureNudges,
  resumePostureNudges,
  STEADY_SAMPLES,
  setPostureNudges,
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
      getState: () => ({ error: fixtures.toastErrorMock, warning: fixtures.toastWarningMock }),
    },
    usePomodoroStore: { getState: () => fixtures.pomodoroStateMock },
    useFocusModeStore: { getState: () => fixtures.focusModeStateMock },
  };
});

vi.mock('@cuewise/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

let localStorageStub: ReturnType<typeof createLocalStorageStub>;
// The clock jump gives each test fresh, distinct timestamps; pause windows are
// torn down explicitly in afterEach ('until-resume' never expires by clock alone).
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

/** Drive the glow on: a full sustained-poor streak while unsuppressed. */
async function glowUp(): Promise<void> {
  emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
  expect(countInvokes('show_glow')).toBe(1);
  expect(getPostureState().glowActive).toBe(true);
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
  resumePostureNudges();
  setPostureNudges(true);
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

describe('glow nudge lifecycle', () => {
  it('shows the glow after sustained poor posture', async () => {
    await startTracking();

    await glowUp();
  });

  it('does not re-invoke show_glow while the glow is already up', async () => {
    await startTracking();
    await glowUp();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);

    expect(countInvokes('show_glow')).toBe(1);
  });

  it('self-clears once recovery has held for the debounce window', async () => {
    await startTracking();
    await glowUp();

    for (let i = 0; i < STEADY_SAMPLES; i += 1) {
      emitSampleFrame(JSON.stringify({ status: 'good' }));
    }

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('a single jitter frame mid-slouch does not drop the glow', async () => {
    await startTracking();
    await glowUp();

    emitSampleFrame(JSON.stringify({ status: 'good' }));

    expect(countInvokes('hide_glow')).toBe(0);
    expect(getPostureState().glowActive).toBe(true);
  });

  it('clears when recovery oscillates across different non-poor statuses', async () => {
    await startTracking();
    await glowUp();

    emitSampleFrame(JSON.stringify({ status: 'good' }));
    emitSampleFrame(JSON.stringify({ status: 'mild' }));
    emitSampleFrame(JSON.stringify({ status: 'good' }));

    // The debounced tray status never settles here — the clear must not need it.
    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('starting a work session hides the glow even while frames are non-poor', async () => {
    await startTracking();
    await glowUp();

    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'work';
    emitSampleFrame(JSON.stringify({ status: 'good' }));

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('self-clears when leaving the frame holds for the debounce window', async () => {
    await startTracking();
    await glowUp();

    for (let i = 0; i < STEADY_SAMPLES; i += 1) {
      emitSampleFrame(JSON.stringify({ status: 'absent' }));
    }

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('a rejected show_glow rolls back so the next sustained streak retries', async () => {
    await startTracking();
    invokeMock.mockRejectedValueOnce(new Error('no monitors'));

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();
    expect(getPostureState().glowActive).toBe(false);

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    expect(countInvokes('show_glow')).toBe(2);
    expect(getPostureState().glowActive).toBe(true);
  });

  it('a failed show warns once per session, but never for no_monitors', async () => {
    await startTracking();
    invokeMock.mockRejectedValueOnce({ kind: 'no_monitors', message: 'no monitors available' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();
    expect(toastWarningMock).not.toHaveBeenCalled();

    invokeMock.mockRejectedValueOnce({ kind: 'window', message: 'boom' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();
    invokeMock.mockRejectedValueOnce({ kind: 'window', message: 'boom' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();

    expect(toastWarningMock).toHaveBeenCalledTimes(1);
  });

  it('a rejected hide_glow retries on later recovered frames while tracking', async () => {
    await startTracking();
    await glowUp();
    invokeMock.mockRejectedValueOnce(new Error('hide failed'));

    for (let i = 0; i < STEADY_SAMPLES; i += 1) {
      emitSampleFrame(JSON.stringify({ status: 'good' }));
    }
    await flushChain();
    expect(getPostureState().glowActive).toBe(true); // rolled back — retry armed

    emitSampleFrame(JSON.stringify({ status: 'good' }));
    expect(countInvokes('hide_glow')).toBe(2);
  });

  it('a rejected hide_glow during a stop does not wedge the next session', async () => {
    await startTracking();
    await glowUp();
    invokeMock.mockRejectedValueOnce(new Error('hide failed'));

    stopPosture();
    await flushChain();

    // No rollback after teardown: a stale glowActive would block the next glow.
    expect(getPostureState().glowActive).toBe(false);
  });

  it('a manual stop hides an active glow', async () => {
    await startTracking();
    await glowUp();

    stopPosture();

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('an unexpected sidecar stop hides an active glow', async () => {
    await startTracking();
    await glowUp();

    emitStopped();

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('turning reminders off hides an active glow', async () => {
    await startTracking();
    await glowUp();

    setPostureNudges(false);

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('no glow fires while reminders are off', async () => {
    await startTracking();
    setPostureNudges(false);

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);

    expect(countInvokes('show_glow')).toBe(0);
  });
});

describe('snooze and pause', () => {
  it('a snoozed window suppresses the glow and resets the streak', async () => {
    await startTracking();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1);

    pausePostureNudges(10);
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);

    expect(countInvokes('show_glow')).toBe(0);
    expect(getPostureState().nudgesPausedUntil).toBe(Date.now() + 10 * 60_000);
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBe(String(Date.now() + 10 * 60_000));
  });

  it('the glow re-arms after the snooze window expires', async () => {
    await startTracking();
    pausePostureNudges(10);

    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);

    expect(countInvokes('show_glow')).toBe(1);
    expect(getPostureState().nudgesPausedUntil).toBeNull();
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBeNull();
  });

  it('pause until-resume holds indefinitely', async () => {
    await startTracking();
    pausePostureNudges('until-resume');

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);

    expect(countInvokes('show_glow')).toBe(0);
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBe('until-resume');
  });

  it('resume lifts an until-resume pause and re-arms the glow', async () => {
    await startTracking();
    pausePostureNudges('until-resume');

    resumePostureNudges();

    expect(getPostureState().nudgesPausedUntil).toBeNull();
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBeNull();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    expect(countInvokes('show_glow')).toBe(1);
  });

  it('an elapsed pause clears even while posture stays good', async () => {
    await startTracking();
    pausePostureNudges(10);

    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    emitSampleFrame(JSON.stringify({ status: 'good' }));

    expect(getPostureState().nudgesPausedUntil).toBeNull();
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBeNull();
  });

  it('turning reminders off clears an active pause', async () => {
    await startTracking();
    pausePostureNudges('until-resume');

    setPostureNudges(false);

    expect(getPostureState().nudgesPausedUntil).toBeNull();
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBeNull();
  });

  it('pausing while the glow is up hides it immediately', async () => {
    await startTracking();
    await glowUp();

    pausePostureNudges(15);

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('a persisted pause window is restored on init', async () => {
    localStorageStub.setItem(ENABLED_KEY, '1');
    localStorageStub.setItem(NUDGES_PAUSED_KEY, String(Date.now() + 30 * 60_000));

    initPosture();
    await flushChain();
    expect(getPostureState().tracking).toBe(true);

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);
    expect(countInvokes('show_glow')).toBe(0);
  });

  it('an expired persisted pause window is discarded on init', async () => {
    localStorageStub.setItem(ENABLED_KEY, '1');
    localStorageStub.setItem(NUDGES_PAUSED_KEY, String(Date.now() - 1));

    initPosture();
    await flushChain();

    expect(getPostureState().nudgesPausedUntil).toBeNull();
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBeNull();
  });

  it('a persisted until-resume pause survives a relaunch', async () => {
    localStorageStub.setItem(ENABLED_KEY, '1');
    localStorageStub.setItem(NUDGES_PAUSED_KEY, 'until-resume');

    initPosture();
    await flushChain();

    expect(getPostureState().nudgesPausedUntil).toBe('until-resume');
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);
    expect(countInvokes('show_glow')).toBe(0);
  });

  it('a garbage persisted pause value is discarded on init', async () => {
    localStorageStub.setItem(ENABLED_KEY, '1');
    localStorageStub.setItem(NUDGES_PAUSED_KEY, 'not-a-timestamp');

    initPosture();
    await flushChain();

    expect(getPostureState().nudgesPausedUntil).toBeNull();
    expect(localStorageStub.getItem(NUDGES_PAUSED_KEY)).toBeNull();
  });
});

describe('smart pause (focus-session-aware nudging)', () => {
  it('never glows while a work session is running', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'work';
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 3);

    expect(countInvokes('show_glow')).toBe(0);
  });

  it('a focus block resets a pre-focus streak — no stale glow when the session ends', async () => {
    await startTracking();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1); // one frame short of the glow

    pomodoroStateMock.status = 'running';
    emitPoorFrames(1); // suppressed, and must reset (not freeze) the streak
    pomodoroStateMock.status = 'idle';

    emitPoorFrames(1);
    // A frozen streak would fire right here (14 pre-focus + 1) — reset must not.
    expect(countInvokes('show_glow')).toBe(0);

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1);
    expect(countInvokes('show_glow')).toBe(1);
  });

  it('starting a work session hides an active glow', async () => {
    await startTracking();
    await glowUp();

    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'work';
    emitPoorFrames(1);

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('still glows during a break when the focus-mode surface is not open', async () => {
    pomodoroStateMock.status = 'running';
    pomodoroStateMock.sessionType = 'break';
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);

    expect(countInvokes('show_glow')).toBe(1);
  });

  it('never glows while the focus-mode surface is open, even with the timer idle', async () => {
    focusModeStateMock.isActive = true;
    await startTracking();

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 3);

    expect(countInvokes('show_glow')).toBe(0);
  });
});
