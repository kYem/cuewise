import { useFocusModeStore, usePomodoroStore, useToastStore } from '@cuewise/app';
import { logger, type PostureSample, type PostureStatus } from '@cuewise/shared';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import { isCommandError } from '../platform/command-error';

// Module-level posture state. Tracking outlives the Settings section (which only
// mounts while open), so the sidecar keeps running — and the toggle stays truthful
// — after Settings closes. All @tauri-apps usage is macOS-local, here and in the
// section that renders this.

/** A nudge pause: an epoch-ms deadline, or open-ended until the user resumes. */
export type NudgePause = number | 'until-resume';

export interface PostureState {
  tracking: boolean;
  nudgesEnabled: boolean;
  sample: PostureSample | null;
  // Debounced status for the menu-bar tray — changes only once a status holds, so
  // the tray doesn't flicker on frame-to-frame jitter (Settings uses live `sample`).
  steadyStatus: PostureStatus | null;
  error: string | null;
  // The screen-edge glow IS the nudge (ENG-40): up after sustained poor posture,
  // down once recovery holds.
  glowActive: boolean;
  nudgesPausedUntil: NudgePause | null;
}

let state: PostureState = {
  tracking: false,
  nudgesEnabled: true,
  sample: null,
  steadyStatus: null,
  error: null,
  glowActive: false,
  nudgesPausedUntil: null,
};
const subscribers = new Set<() => void>();
let unlisteners: UnlistenFn[] = [];
// True while a start_posture spawn is in flight. `tracking` only flips true after
// the async chain resolves, so without this a rapid re-toggle would fire a second
// native start_posture before the first settled (the listener leak is handled
// separately by the detachListeners at the top of attachListeners).
let starting = false;
// Set if a stop lands while a start is still spawning: the in-flight start checks it
// and bails before turning the camera on, honoring an OFF issued during the attach
// window (when detachListeners can't yet see the not-attached listeners).
let stopRequestedDuringStart = false;
// Consecutive unreadable sidecar frames; escalates to a visible error at 5.
let parseFailures = 0;
// The status values this build understands; anything else is a bad frame (protocol
// drift), not a valid sample — reject it so it can't reach an unguarded consumer.
// Derived from an exhaustive Record so adding a PostureStatus without listing it here
// is a compile error (a plain array would silently under-list and over-reject frames).
const KNOWN_STATUSES = Object.keys({
  good: 0,
  mild: 0,
  poor: 0,
  absent: 0,
} satisfies Record<PostureStatus, 0>) as PostureStatus[];

// Glow threshold; no cooldown — the glow persists until recovery instead.
// Exported so tests exercise the real threshold instead of mirroring it.
export const NUDGE_AFTER_POOR_SAMPLES = 15; // ~30s at the sidecar's 2s cadence
let poorStreak = 0;
// Consecutive non-poor frames; the glow clears once this holds, so one jitter
// frame can't drop it (any non-poor status counts — oscillation still clears).
let nonPoorStreak = 0;
// Warn once per session when the glow can't be shown — a silently missing nudge
// is the exact failure the old notification path used to warn about.
let warnedGlowUndeliverable = false;
// Warn the user once per tracking session when a failure would otherwise be silent,
// without storming a toast on every retry. Reset in resetDerivation.
let warnedUnreadable = false;

// Debounce for the tray status and the glow's clear: adopt a change only once it
// holds, so frame-to-frame jitter moves neither. Exported for tests.
export const STEADY_SAMPLES = 3; // ~6s at the sidecar's 2s cadence
let pendingStatus: PostureStatus | null = null;
let pendingCount = 0;

// Persist the opt-in preferences (macOS-local) so the toggles stick across launches.
const ENABLED_KEY = 'cuewise.posture.enabled';
const NUDGES_KEY = 'cuewise.posture.nudges';
const NUDGES_PAUSED_KEY = 'cuewise.posture.nudgesPausedUntil';

// A poisoned Rust mutex is an internal bug (a prior panic), not the ordinary
// camera/permission failure the callers already toast about — flag it distinctly
// in the log so it doesn't read like just another sidecar hiccup.
function logCommandFailure(context: string, error: unknown): void {
  if (isCommandError(error) && error.kind === 'state_poisoned') {
    logger.error(`${context}: internal state lock poisoned (bug)`, error);
    return;
  }
  logger.error(context, error);
}

// localStorage can throw (private mode, quota); prefs must never take the
// controller down over it.
function writeLocal(key: string, value: string | null, context: string): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    logger.error(context, error);
  }
}

function persist(key: string, value: boolean): void {
  writeLocal(key, value ? '1' : '0', 'Failed to persist posture preference');
}

function setState(patch: Partial<PostureState>): void {
  state = { ...state, ...patch };
  for (const notify of subscribers) {
    notify();
  }
}

function detachListeners(): void {
  for (const unlisten of unlisteners) {
    unlisten();
  }
  unlisteners = [];
}

// Zero the per-session derivation counters so a new session starts clean. Every
// teardown path must call this, or a stale poorStreak can nudge early after resume.
function resetDerivation(): void {
  poorStreak = 0;
  nonPoorStreak = 0;
  pendingStatus = null;
  pendingCount = 0;
  parseFailures = 0;
  // Per-session warn latches reset with the session, so a deliberate restart can
  // warn again if the problem persists.
  warnedUnreadable = false;
  warnedGlowUndeliverable = false;
}

// Count consecutive unreadable frames; escalate to a visible error at 5 so a protocol
// drift doesn't sit silently on "Starting…". Toast once too — Settings may be closed,
// where the panel error never renders — matching the unexpected-stop path.
function noteBadFrame(): void {
  parseFailures += 1;
  if (parseFailures < 5) {
    return;
  }
  const message = 'Posture readings could not be read.';
  // Only write when it changes — this runs every ~2s while frames stay unreadable.
  if (state.error !== message) {
    setState({ error: message });
  }
  if (!warnedUnreadable) {
    warnedUnreadable = true;
    useToastStore.getState().error(message);
  }
}

async function attachListeners(): Promise<void> {
  detachListeners(); // guard against a double-attach orphaning the previous pair
  const onSample = await listen<string>('posture://sample', (event) => {
    let sample: PostureSample;
    try {
      sample = JSON.parse(event.payload) as PostureSample;
    } catch (error) {
      // Only the parse is fragile — keep downstream throws out of this catch.
      logger.error('Failed to parse posture sample', error);
      noteBadFrame();
      return;
    }
    if (
      sample === null ||
      typeof sample !== 'object' ||
      !('status' in sample) ||
      !KNOWN_STATUSES.includes(sample.status)
    ) {
      // Not a sample we understand: a bare `null`/primitive line, or an unknown status
      // from a newer sidecar. Reject as a bad frame — this is the primary gate keeping an
      // unknown status out of the tray's POSTURE_META lookup (the tray also backstops it).
      logger.error('Posture sample had an unexpected shape', event.payload);
      noteBadFrame();
      return;
    }
    parseFailures = 0;
    // A readable frame means we've recovered — drop any stale error (only the
    // unreadable-frames error can coexist with live samples).
    if (state.error !== null) {
      setState({ sample, error: null });
    } else {
      setState({ sample });
    }
    updateSteadyStatus(sample.status);
    updateNudgeGlow(sample);
  });
  let onStopped: UnlistenFn;
  try {
    onStopped = await listen('posture://stopped', () => {
      // Reached only for an *unexpected* stop (stopPosture detaches first), so surface
      // the camera/permission failure even with Settings closed. The pref is kept — the
      // camera may be transiently busy — so tracking can still auto-resume next boot.
      hideGlowIfActive();
      detachListeners();
      resetDerivation();
      const message = 'Posture tracking stopped — camera unavailable or permission denied.';
      setState({ tracking: false, sample: null, steadyStatus: null, error: message });
      useToastStore.getState().error(message);
    });
  } catch (error) {
    onSample(); // the second registration failed — unlisten the first so it doesn't leak
    throw error;
  }
  unlisteners = [onSample, onStopped];
}

export function startPosture(): void {
  // `tracking` only flips true once the async spawn resolves, so guard the
  // in-flight window too or a second toggle double-attaches and double-counts.
  if (state.tracking || starting) {
    return;
  }
  starting = true;
  stopRequestedDuringStart = false;
  persist(ENABLED_KEY, true);
  setState({ error: null });
  // Attach listeners BEFORE spawning: the sidecar can fail its camera check and emit
  // posture://stopped within tens of ms, and Tauri won't buffer that for a listener
  // registered afterward — so attach-after-invoke would silently drop the failure.
  attachListeners()
    .then(() => {
      // A stop landed while we were attaching — honor it and never turn the camera on.
      if (stopRequestedDuringStart) {
        detachListeners();
        return;
      }
      return invoke('start_posture');
    })
    .then(() => {
      // Don't flip tracking on if a stop raced in, or the sidecar already died and ran
      // onStopped (which detaches) — either way the session is no longer valid.
      if (!stopRequestedDuringStart && unlisteners.length > 0) {
        setState({ tracking: true });
      }
    })
    .catch((error) => {
      detachListeners();
      // A frame that raced in before the rejection may have bumped the counters —
      // clear them, or the leftovers (e.g. poorStreak) taint the next session.
      resetDerivation();
      logCommandFailure('Failed to start posture tracking', error);
      // If the user asked to stop mid-start, the failure is moot — don't surface a
      // start-error toast for a session they already turned off.
      if (stopRequestedDuringStart) {
        return;
      }
      // Nothing renders the panel error when Settings is closed (e.g. auto-resume
      // at launch), so surface it and clear the pref rather than retry every boot.
      persist(ENABLED_KEY, false);
      const message = 'Could not start posture tracking — check camera access.';
      setState({ error: message });
      useToastStore.getState().error(message);
    })
    .finally(() => {
      starting = false;
    });
}

export function stopPosture(): void {
  if (starting) {
    // A start is still spawning; its detachListeners can't see listeners that aren't
    // attached yet, so flag the in-flight chain to bail before the camera comes on.
    stopRequestedDuringStart = true;
  }
  persist(ENABLED_KEY, false);
  hideGlowIfActive();
  invoke('stop_posture').catch((error) => {
    logCommandFailure('Failed to stop posture tracking', error);
    useToastStore.getState().error("Couldn't stop posture tracking — the camera may still be on.");
  });
  detachListeners();
  resetDerivation();
  // Clear any stale error too — the user chose to stop, and a leftover failure
  // message would otherwise pin the tray's ⚠️ indicator indefinitely.
  setState({ tracking: false, sample: null, steadyStatus: null, error: null });
}

// Adopt a status for the tray only once it has held for STEADY_SAMPLES in a row.
function updateSteadyStatus(status: PostureStatus): void {
  if (status === state.steadyStatus) {
    pendingStatus = null;
    pendingCount = 0;
    return;
  }
  if (status === pendingStatus) {
    pendingCount += 1;
  } else {
    pendingStatus = status;
    pendingCount = 1;
  }
  if (pendingCount >= STEADY_SAMPLES) {
    pendingStatus = null;
    pendingCount = 0;
    setState({ steadyStatus: status });
  }
}

/** Restore persisted preferences and auto-resume tracking if it was left on. */
export function initPosture(): void {
  try {
    const nudges = localStorage.getItem(NUDGES_KEY);
    if (nudges !== null) {
      setState({ nudgesEnabled: nudges === '1' });
    }
    restorePausedUntil();
    if (localStorage.getItem(ENABLED_KEY) === '1') {
      startPosture();
    }
  } catch (error) {
    logger.error('Failed to restore posture preferences', error);
  }
}

// A pause window survives a relaunch; an already-elapsed one is discarded.
function restorePausedUntil(): void {
  const paused = localStorage.getItem(NUDGES_PAUSED_KEY);
  if (paused === null) {
    return;
  }
  if (paused === 'until-resume') {
    setState({ nudgesPausedUntil: paused });
    return;
  }
  const until = Number(paused);
  if (Number.isFinite(until) && Date.now() < until) {
    setState({ nudgesPausedUntil: until });
  } else {
    writePausedUntil(null);
  }
}

export function calibratePosture(): void {
  invoke('calibrate_posture').catch((error) => {
    logCommandFailure('Failed to calibrate posture', error);
    useToastStore.getState().error("Couldn't calibrate posture — please try again.");
  });
}

/** Toggle the "remind me when I slouch" glow nudges. */
export function setPostureNudges(enabled: boolean): void {
  persist(NUDGES_KEY, enabled);
  poorStreak = 0;
  setState({ nudgesEnabled: enabled });
  if (!enabled) {
    // The master switch resets any pause too — otherwise a pause set before
    // toggling off silently re-suppresses the glow when reminders come back.
    writePausedUntil(null);
    hideGlowIfActive();
  }
}

// Smart Pause (ENG-39): suppress nudges during a running work session, or while the
// immersive focus-mode surface is open (which stays open through breaks by design).
function isFocusSessionActive(): boolean {
  const pomodoro = usePomodoroStore.getState();
  if (pomodoro.status === 'running' && pomodoro.sessionType === 'work') {
    return true;
  }
  return useFocusModeStore.getState().isActive;
}

function showGlow(): void {
  setState({ glowActive: true });
  invoke('show_glow').catch((error) => {
    logCommandFailure('Failed to show the posture glow', error);
    // Roll back so the next sustained streak retries instead of being blocked.
    setState({ glowActive: false });
    // Display sleep legitimately has nowhere to glow; anything else warrants a
    // once-per-session heads-up — an enabled nudge silently never firing is worse.
    const noMonitors = isCommandError(error) && error.kind === 'no_monitors';
    if (!noMonitors && !warnedGlowUndeliverable) {
      warnedGlowUndeliverable = true;
      useToastStore
        .getState()
        .warning("Couldn't show the posture glow — reminders may not appear.");
    }
  });
}

function hideGlowIfActive(): void {
  if (!state.glowActive) {
    return;
  }
  setState({ glowActive: false });
  invoke('hide_glow').catch((error) => {
    logCommandFailure('Failed to hide the posture glow', error);
    // Roll back only while frames still flow (a retry needs a next sample) — after
    // teardown a stale true would instead wedge the next session's first glow.
    if (state.tracking) {
      setState({ glowActive: true });
    }
  });
}

function writePausedUntil(value: NudgePause | null): void {
  const persisted = value === null ? null : String(value);
  writeLocal(NUDGES_PAUSED_KEY, persisted, 'Failed to persist the nudge pause');
  setState({ nudgesPausedUntil: value });
}

/** Silence glow nudges for a while; tracking and the tray dot keep running. */
export function pausePostureNudges(duration: 10 | 15 | 60 | 'until-resume'): void {
  const until = duration === 'until-resume' ? duration : Date.now() + duration * 60_000;
  writePausedUntil(until);
  poorStreak = 0;
  hideGlowIfActive();
}

/** Lift a pause/snooze; the next sustained-poor streak can glow again. */
export function resumePostureNudges(): void {
  writePausedUntil(null);
}

// Expiry runs at frame time on EVERY status — no timers (hidden webviews throttle
// them; see scheduler.rs) — so the tray/Settings "paused until" can't go stale.
function clearElapsedPause(): void {
  const pausedUntil = state.nudgesPausedUntil;
  if (typeof pausedUntil === 'number' && Date.now() >= pausedUntil) {
    writePausedUntil(null);
  }
}

// The glow IS the nudge (ENG-40): up after sustained poor posture, down once
// recovery holds — sitting back is the dismissal.
function updateNudgeGlow(sample: PostureSample): void {
  clearElapsedPause();
  if (!state.nudgesEnabled || state.nudgesPausedUntil !== null || isFocusSessionActive()) {
    // Suppression hides immediately, on any frame. It is also streak-neutral:
    // reset, don't freeze, so a prior lean can't fire a stale glow when it lifts.
    poorStreak = 0;
    nonPoorStreak = 0;
    hideGlowIfActive();
    return;
  }
  if (sample.status !== 'poor') {
    poorStreak = 0;
    nonPoorStreak += 1;
    if (nonPoorStreak >= STEADY_SAMPLES) {
      hideGlowIfActive();
    }
    return;
  }
  nonPoorStreak = 0;
  if (state.glowActive) {
    return;
  }
  poorStreak += 1;
  if (poorStreak >= NUDGE_AFTER_POOR_SAMPLES) {
    poorStreak = 0;
    showGlow();
  }
}

/** Human copy for a pause's end, shared by the tray menu and Settings. */
export function describePauseEnd(pausedUntil: NudgePause): string {
  if (pausedUntil === 'until-resume') {
    return 'until you resume';
  }
  const at = new Date(pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `until ${at}`;
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot(): PostureState {
  return state;
}

/** Non-hook snapshot of the posture state (imperative hosts, tests). */
export function getPostureState(): PostureState {
  return state;
}

/** Subscribe a component to the shared posture state. */
export function usePosture(): PostureState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
