import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countInvokes,
  createLocalStorageStub,
  ENABLED_KEY,
  emitPoorFrames,
  emitSampleFrame,
  emitStopped,
  focusModeStateMock,
  hhmmFromNow,
  invokeMock,
  NUDGES_PAUSED_KEY,
  PREVIEW_FAILED_WARNING,
  pomodoroStateMock,
  resetPostureMocks,
  SAVE_FAILED_WARNING,
  SENSITIVITY_APPLY_FAILED_WARNING,
  START_FAILED_ERROR,
  STOPPED_ERROR,
  toastErrorMock,
  toastWarningMock,
  UNREADABLE_ERROR,
  unlistenSpies,
} from './__fixtures__/posture-controller.fixtures';
import { chipPresentation } from './chip-presentation';
import {
  getPostureState,
  initPosture,
  isWithinQuietHours,
  NUDGE_AFTER_POOR_SAMPLES,
  pausePostureNudges,
  resumePostureNudges,
  STEADY_SAMPLES,
  setGlowIntensity,
  setGlowStyle,
  setNudgeDelay,
  setNudgeSensitivity,
  setPostureNudges,
  setQuietHours,
  startGlowPreview,
  startPosture,
  stopGlowPreview,
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
    expect(getPostureState().glowUndeliverable).toBe(false);

    invokeMock.mockRejectedValueOnce({ kind: 'window', message: 'boom' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();
    invokeMock.mockRejectedValueOnce({ kind: 'window', message: 'boom' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();

    expect(countInvokes('show_glow')).toBe(3);
    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    expect(getPostureState().glowUndeliverable).toBe(true);
  });

  it('a later successful show clears the undeliverable flag', async () => {
    await startTracking();
    invokeMock.mockRejectedValueOnce({ kind: 'window', message: 'boom' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();
    expect(getPostureState().glowUndeliverable).toBe(true);

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();

    expect(getPostureState().glowActive).toBe(true);
    expect(getPostureState().glowUndeliverable).toBe(false);
  });

  it('partial monitor coverage raises the undeliverable warning', async () => {
    await startTracking();
    invokeMock.mockResolvedValueOnce({ shown: 1, monitors: 2 });

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();

    // One display silently missing its glow must not read as full delivery.
    expect(getPostureState().glowActive).toBe(true);
    expect(getPostureState().glowUndeliverable).toBe(true);
  });

  it('an unreadable stream releases an active glow', async () => {
    await startTracking();
    await glowUp();

    for (let i = 0; i < 5; i += 1) {
      emitSampleFrame('not json');
    }

    // Bad frames can't attest posture is still poor — the glow must not stick.
    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('a hide failure during a stop tells the user instead of staying silent', async () => {
    await startTracking();
    await glowUp();
    invokeMock.mockRejectedValueOnce(new Error('hide failed'));

    stopPosture();
    await flushChain();

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Couldn't clear the posture glow — restart Cuewise if it lingers."
    );
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

    resumePostureNudges();
    emitPoorFrames(1);
    // A frozen streak would fire here (14 pre-pause + 1) — reset must not.
    expect(countInvokes('show_glow')).toBe(0);
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

describe('glow preview', () => {
  afterEach(() => {
    stopGlowPreview();
  });

  it('shows the glow on demand, without tracking and without touching glowActive', async () => {
    startGlowPreview();
    await flushChain();

    expect(countInvokes('show_glow')).toBe(1);
    expect(getPostureState().glowPreviewActive).toBe(true);
    expect(getPostureState().glowActive).toBe(false);
  });

  it('warns and rolls back when the preview cannot be shown', async () => {
    invokeMock.mockRejectedValueOnce(new Error('no windows'));

    startGlowPreview();
    await flushChain();

    expect(getPostureState().glowPreviewActive).toBe(false);
    expect(toastWarningMock).toHaveBeenCalledWith(PREVIEW_FAILED_WARNING);
  });

  it('stopping the preview hides the glow', async () => {
    startGlowPreview();
    await flushChain();

    stopGlowPreview();

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowPreviewActive).toBe(false);
  });

  it('stopping the preview leaves a real nudge glow on screen', async () => {
    await startTracking();
    await glowUp();
    startGlowPreview();

    stopGlowPreview();

    // The nudge still owns the windows — the preview must not steal them.
    expect(countInvokes('hide_glow')).toBe(0);
  });

  it('a nudge recovery during a preview leaves the preview on screen', async () => {
    await startTracking();
    startGlowPreview();
    await flushChain();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES); // a real nudge fires mid-preview
    expect(getPostureState().glowActive).toBe(true);

    for (let i = 0; i < STEADY_SAMPLES; i += 1) {
      emitSampleFrame(JSON.stringify({ status: 'good' }));
    }

    // glowActive clears, but the preview still owns the windows.
    expect(getPostureState().glowActive).toBe(false);
    expect(countInvokes('hide_glow')).toBe(0);

    stopGlowPreview();
    expect(countInvokes('hide_glow')).toBe(1);
  });
});

describe('configurable nudge delay', () => {
  afterEach(() => {
    setNudgeDelay(30);
  });

  it('a strict delay glows after ~15s of poor posture', async () => {
    await startTracking();
    setNudgeDelay(15);

    emitPoorFrames(7); // one frame short at the 2s cadence
    expect(countInvokes('show_glow')).toBe(0);

    emitPoorFrames(1);
    expect(countInvokes('show_glow')).toBe(1);
  });

  it('a gentle delay needs ~60s of poor posture', async () => {
    await startTracking();
    setNudgeDelay(60);

    emitPoorFrames(29);
    expect(countInvokes('show_glow')).toBe(0);

    emitPoorFrames(1);
    expect(countInvokes('show_glow')).toBe(1);
  });

  it('changing the delay restarts the count instead of firing instantly', async () => {
    await startTracking();
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES - 1); // one short of the default

    setNudgeDelay(15); // shorter threshold than the accumulated streak
    emitPoorFrames(7);
    expect(countInvokes('show_glow')).toBe(0);

    emitPoorFrames(1);
    expect(countInvokes('show_glow')).toBe(1);
  });

  it('persists and restores across a relaunch, discarding garbage', async () => {
    setNudgeDelay(60);
    expect(localStorageStub.getItem('cuewise.posture.nudgeDelaySeconds')).toBe('60');

    localStorageStub.setItem(ENABLED_KEY, '1');
    initPosture();
    await flushChain();
    expect(getPostureState().nudgeDelaySeconds).toBe(60);

    stopPosture();
    localStorageStub.setItem('cuewise.posture.nudgeDelaySeconds', '45'); // not a preset
    initPosture();
    await flushChain();
    expect(getPostureState().nudgeDelaySeconds).toBe(30);
    expect(localStorageStub.getItem('cuewise.posture.nudgeDelaySeconds')).toBeNull();
  });
});

describe('glow appearance preferences', () => {
  afterEach(() => {
    setGlowIntensity('standard');
    setGlowStyle('glow');
  });

  it('persists the choice for the glow windows to read', () => {
    setGlowIntensity('subtle');

    expect(getPostureState().glowIntensity).toBe('subtle');
    expect(localStorageStub.getItem('cuewise.posture.glowIntensity')).toBe('subtle');
  });

  it('restores on init and discards garbage', async () => {
    localStorageStub.setItem('cuewise.posture.glowIntensity', 'subtle');
    initPosture();
    await flushChain();
    expect(getPostureState().glowIntensity).toBe('subtle');

    localStorageStub.setItem('cuewise.posture.glowIntensity', 'blinding');
    initPosture();
    await flushChain();
    expect(getPostureState().glowIntensity).toBe('standard');
  });

  it('persists and restores the nudge style', async () => {
    setGlowStyle('border');
    expect(getPostureState().glowStyle).toBe('border');
    expect(localStorageStub.getItem('cuewise.posture.glowStyle')).toBe('border');

    setGlowStyle('glow');
    localStorageStub.setItem('cuewise.posture.glowStyle', 'tint');
    initPosture();
    await flushChain();
    expect(getPostureState().glowStyle).toBe('tint');
  });

  it('keeps the persisted style and warns when the write fails', () => {
    setGlowStyle('border');
    const failingWrite = vi.spyOn(localStorageStub, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    setGlowStyle('tint');
    failingWrite.mockRestore();

    // The glow windows read localStorage — Settings must not claim a style they won't use.
    expect(getPostureState().glowStyle).toBe('border');
    expect(localStorageStub.getItem('cuewise.posture.glowStyle')).toBe('border');
    // Exactly one: the failed write warns, the successful seed write must not.
    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    expect(toastWarningMock).toHaveBeenCalledWith(SAVE_FAILED_WARNING);
  });

  it('keeps the persisted strength and warns when the write fails', () => {
    setGlowIntensity('subtle');
    const failingWrite = vi.spyOn(localStorageStub, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    setGlowIntensity('intense');
    failingWrite.mockRestore();

    expect(getPostureState().glowIntensity).toBe('subtle');
    expect(localStorageStub.getItem('cuewise.posture.glowIntensity')).toBe('subtle');
    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    expect(toastWarningMock).toHaveBeenCalledWith(SAVE_FAILED_WARNING);
  });
});

describe('nudge sensitivity', () => {
  afterEach(() => {
    setNudgeSensitivity('balanced');
  });

  it('persists without applying while tracking is off', () => {
    setNudgeSensitivity('strict');

    expect(getPostureState().nudgeSensitivity).toBe('strict');
    expect(localStorageStub.getItem('cuewise.posture.sensitivity')).toBe('strict');
    expect(countInvokes('set_posture_sensitivity')).toBe(0);
  });

  it('applies on every start and again on a live change', async () => {
    setNudgeSensitivity('strict');
    await startTracking();
    // A fresh sidecar boots with default thresholds — the start must re-send.
    expect(countInvokes('set_posture_sensitivity')).toBe(1);
    expect(invokeMock).toHaveBeenLastCalledWith('set_posture_sensitivity', { preset: 'strict' });

    setNudgeSensitivity('relaxed');
    await flushChain();
    expect(countInvokes('set_posture_sensitivity')).toBe(2);
    expect(invokeMock).toHaveBeenLastCalledWith('set_posture_sensitivity', { preset: 'relaxed' });
  });

  it('warns when the live apply fails but keeps the preference', async () => {
    await startTracking();
    invokeMock.mockRejectedValueOnce(new Error('sidecar pipe broke'));

    setNudgeSensitivity('strict');
    await flushChain();

    expect(toastWarningMock).toHaveBeenCalledWith(SENSITIVITY_APPLY_FAILED_WARNING);
    // The preference still landed — it re-applies on the next start.
    expect(localStorageStub.getItem('cuewise.posture.sensitivity')).toBe('strict');
  });

  it('restores on init and discards garbage', async () => {
    localStorageStub.setItem('cuewise.posture.sensitivity', 'relaxed');
    initPosture();
    await flushChain();
    expect(getPostureState().nudgeSensitivity).toBe('relaxed');

    localStorageStub.setItem('cuewise.posture.sensitivity', 'ultra');
    initPosture();
    await flushChain();
    expect(getPostureState().nudgeSensitivity).toBe('balanced');
    expect(localStorageStub.getItem('cuewise.posture.sensitivity')).toBeNull();
  });
});

describe('isWithinQuietHours', () => {
  function window(enabled: boolean, start: string, end: string) {
    return { enabled, start, end };
  }
  function at(hours: number, minutes: number): Date {
    return new Date(2026, 6, 13, hours, minutes);
  }

  it('is inert while disabled', () => {
    expect(isWithinQuietHours(window(false, '00:00', '23:59'), at(12, 0))).toBe(false);
  });

  it('covers a same-day window as [start, end)', () => {
    const quiet = window(true, '09:00', '17:00');
    expect(isWithinQuietHours(quiet, at(9, 0))).toBe(true);
    expect(isWithinQuietHours(quiet, at(16, 59))).toBe(true);
    expect(isWithinQuietHours(quiet, at(8, 59))).toBe(false);
    expect(isWithinQuietHours(quiet, at(17, 0))).toBe(false);
  });

  it('wraps midnight when start is after end', () => {
    const quiet = window(true, '22:00', '08:00');
    expect(isWithinQuietHours(quiet, at(23, 30))).toBe(true);
    expect(isWithinQuietHours(quiet, at(7, 59))).toBe(true);
    expect(isWithinQuietHours(quiet, at(12, 0))).toBe(false);
  });

  it('treats equal times as an empty window and malformed times as inert', () => {
    expect(isWithinQuietHours(window(true, '10:00', '10:00'), at(10, 0))).toBe(false);
    expect(isWithinQuietHours(window(true, '25:00', '08:00'), at(12, 0))).toBe(false);
    expect(isWithinQuietHours(window(true, 'zz:00', '08:00'), at(12, 0))).toBe(false);
  });
});

describe('quiet hours', () => {
  afterEach(() => {
    setQuietHours({ enabled: false, start: '22:00', end: '08:00' });
  });

  it('suppresses new glows inside the window and clears an active one', async () => {
    await startTracking();
    await glowUp();

    setQuietHours({ enabled: true, start: hhmmFromNow(-60), end: hhmmFromNow(60) });
    emitSampleFrame(JSON.stringify({ status: 'poor' }));

    expect(countInvokes('hide_glow')).toBe(1);
    expect(getPostureState().glowActive).toBe(false);

    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES * 2);
    expect(countInvokes('show_glow')).toBe(1);
  });

  it('does not suppress outside the window', async () => {
    await startTracking();
    setQuietHours({ enabled: true, start: hhmmFromNow(60), end: hhmmFromNow(120) });

    await glowUp();
  });

  it('persists and restores, discarding garbage', async () => {
    setQuietHours({ enabled: true, start: '21:00', end: '07:30' });
    expect(localStorageStub.getItem('cuewise.posture.quietHours')).toBe(
      '{"enabled":true,"start":"21:00","end":"07:30"}'
    );

    initPosture();
    await flushChain();
    expect(getPostureState().quietHours).toEqual({ enabled: true, start: '21:00', end: '07:30' });

    localStorageStub.setItem('cuewise.posture.quietHours', '{"enabled":"yes"}');
    initPosture();
    await flushChain();
    expect(getPostureState().quietHours).toEqual({ enabled: false, start: '22:00', end: '08:00' });
    expect(localStorageStub.getItem('cuewise.posture.quietHours')).toBeNull();
  });

  it('surfaces the active window on the chip', async () => {
    await startTracking();
    const end = hhmmFromNow(60);
    setQuietHours({ enabled: true, start: hhmmFromNow(-60), end });

    expect(chipPresentation(getPostureState())).toEqual({
      dot: 'bg-tertiary',
      label: `Quiet hours until ${end}`,
    });
  });
});

describe('posture chip presentation', () => {
  it('is hidden while not tracking', () => {
    expect(chipPresentation(getPostureState())).toBeNull();
  });

  it('shows starting before any steady status settles', async () => {
    await startTracking();
    expect(chipPresentation(getPostureState())).toMatchObject({ label: 'Starting…' });
  });

  it('shows the steady status once it holds', async () => {
    await startTracking();
    for (let i = 0; i < STEADY_SAMPLES; i += 1) {
      emitSampleFrame(JSON.stringify({ status: 'good' }));
    }
    expect(chipPresentation(getPostureState())).toMatchObject({ label: 'Good posture' });
  });

  it('surfaces a readings error above the stale status', async () => {
    await startTracking();
    for (let i = 0; i < STEADY_SAMPLES; i += 1) {
      emitSampleFrame(JSON.stringify({ status: 'good' }));
    }
    for (let i = 0; i < 5; i += 1) {
      emitSampleFrame('not json');
    }
    // The tray mirrors this state too — the chip must not keep saying "Good".
    expect(chipPresentation(getPostureState())).toMatchObject({ label: 'Readings unavailable' });
  });

  it('surfaces glow undeliverability above the status', async () => {
    await startTracking();
    invokeMock.mockRejectedValueOnce({ kind: 'window', message: 'boom' });
    emitPoorFrames(NUDGE_AFTER_POOR_SAMPLES);
    await flushChain();
    emitSampleFrame(JSON.stringify({ status: 'good' }));

    expect(chipPresentation(getPostureState())).toMatchObject({ label: 'Glow unavailable' });
  });

  it('shows an active pause', async () => {
    await startTracking();
    pausePostureNudges('until-resume');

    const presentation = chipPresentation(getPostureState());
    expect(presentation?.label).toBe('Nudges paused until you resume');
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
