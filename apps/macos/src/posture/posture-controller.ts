import { useFocusModeStore, usePomodoroStore, useToastStore } from '@cuewise/app';
import { logger, type PostureSample, type PostureStatus } from '@cuewise/shared';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import {
  GLOW_INTENSITY_KEY,
  GLOW_STYLE_KEY,
  type GlowIntensity,
  type GlowStyle,
  readGlowIntensity,
  readGlowStyle,
} from '../glow/glow-prefs';
import { isCommandError } from '../platform/command-error';

// Module-level posture state. Tracking outlives the Settings section (which only
// mounts while open), so the sidecar keeps running — and the toggle stays truthful
// — after Settings closes. All @tauri-apps usage is macOS-local, here and in the
// section that renders this.

/** A nudge pause: an epoch-ms deadline, or open-ended until the user resumes. */
export type NudgePause = number | 'until-resume';

/** How long poor posture must persist before the glow shows (Settings presets). */
export type NudgeDelaySeconds = 15 | 30 | 60;

/**
 * How much lean counts as slouching; each preset bundles its dead zone. Keep in
 * sync with `KNOWN_PRESETS` (posture.rs) and `SensitivityPreset` (PostureAnalyzer.swift).
 */
export type NudgeSensitivity = 'strict' | 'balanced' | 'relaxed';

/** A daily no-nudge window; overnight ranges (start > end) wrap midnight. */
export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM", 24-hour
  end: string;
}

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
  // Latest show_glow failed — mirrored to the tray, the only always-visible
  // surface, since the warn toast renders in the often-hidden webview.
  glowUndeliverable: boolean;
  // Settings' on-demand glow preview; independent of tracking and of glowActive.
  glowPreviewActive: boolean;
  nudgesPausedUntil: NudgePause | null;
  nudgeDelaySeconds: NudgeDelaySeconds;
  glowIntensity: GlowIntensity;
  glowStyle: GlowStyle;
  nudgeSensitivity: NudgeSensitivity;
  quietHours: QuietHours;
}

const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '22:00', end: '08:00' };

let state: PostureState = {
  tracking: false,
  nudgesEnabled: true,
  sample: null,
  steadyStatus: null,
  error: null,
  glowActive: false,
  glowUndeliverable: false,
  glowPreviewActive: false,
  nudgesPausedUntil: null,
  nudgeDelaySeconds: 30,
  glowIntensity: 'standard',
  glowStyle: 'glow',
  nudgeSensitivity: 'balanced',
  quietHours: DEFAULT_QUIET_HOURS,
};
const subscribers = new Set<() => void>();
let unlisteners: UnlistenFn[] = [];
// True while a start_posture spawn is in flight. `tracking` only flips true after
// the async chain resolves, so without this a rapid re-toggle would fire a second
// native start_posture — and double-attach listeners, since the top-of-attach
// detach can only see listeners that have already been recorded.
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

const SAMPLE_INTERVAL_SECONDS = 2; // the sidecar's cadence
// Default glow threshold (the 30s preset); no cooldown — the glow persists until
// recovery instead. Exported so tests exercise the real default.
export const NUDGE_AFTER_POOR_SAMPLES = 30 / SAMPLE_INTERVAL_SECONDS;

// The user-selected delay, as a sample count for the streak comparison.
function nudgeThresholdSamples(): number {
  return Math.max(1, Math.round(state.nudgeDelaySeconds / SAMPLE_INTERVAL_SECONDS));
}
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
const NUDGE_DELAY_KEY = 'cuewise.posture.nudgeDelaySeconds';
const SENSITIVITY_KEY = 'cuewise.posture.sensitivity';
const QUIET_HOURS_KEY = 'cuewise.posture.quietHours';

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
function writeLocal(key: string, value: string | null, context: string): boolean {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
    return true;
  } catch (error) {
    logger.error(context, error);
    return false;
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
  // An unreadable stream can't attest posture is still poor — release the glow
  // rather than leave it stuck (mirrors the unexpected-stop path).
  hideGlowIfActive();
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
  setState({ error: null, glowUndeliverable: false });
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
        applySensitivity();
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
    restoreNudgeDelay();
    restoreSensitivity();
    restoreQuietHours();
    setState({ glowIntensity: readGlowIntensity(), glowStyle: readGlowStyle() });
    if (localStorage.getItem(ENABLED_KEY) === '1') {
      startPosture();
    }
  } catch (error) {
    logger.error('Failed to restore posture preferences', error);
  }
}

// Only the known presets restore; anything else is discarded back to the default.
function restoreNudgeDelay(): void {
  const persisted = localStorage.getItem(NUDGE_DELAY_KEY);
  if (persisted === null) {
    return;
  }
  const seconds = Number(persisted);
  if (seconds === 15 || seconds === 30 || seconds === 60) {
    setState({ nudgeDelaySeconds: seconds });
  } else {
    writeLocal(NUDGE_DELAY_KEY, null, 'Failed to discard the nudge delay');
    setState({ nudgeDelaySeconds: 30 });
  }
}

// Only known presets restore; anything else is discarded back to the default.
function restoreSensitivity(): void {
  const persisted = localStorage.getItem(SENSITIVITY_KEY);
  if (persisted === null) {
    return;
  }
  if (persisted === 'strict' || persisted === 'balanced' || persisted === 'relaxed') {
    setState({ nudgeSensitivity: persisted });
  } else {
    writeLocal(SENSITIVITY_KEY, null, 'Failed to discard the nudge sensitivity');
    setState({ nudgeSensitivity: 'balanced' });
  }
}

// A malformed persisted window restores as the default rather than lingering.
function restoreQuietHours(): void {
  const persisted = localStorage.getItem(QUIET_HOURS_KEY);
  if (persisted === null) {
    return;
  }
  const parsed = parseQuietHours(persisted);
  if (parsed !== null) {
    setState({ quietHours: parsed });
  } else {
    writeLocal(QUIET_HOURS_KEY, null, 'Failed to discard the quiet hours');
    setState({ quietHours: DEFAULT_QUIET_HOURS });
  }
}

function parseQuietHours(persisted: string): QuietHours | null {
  try {
    const value: unknown = JSON.parse(persisted);
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.enabled !== 'boolean' ||
      typeof record.start !== 'string' ||
      typeof record.end !== 'string'
    ) {
      return null;
    }
    if (parseMinutes(record.start) === null || parseMinutes(record.end) === null) {
      return null;
    }
    return { enabled: record.enabled, start: record.start, end: record.end };
  } catch {
    return null;
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

// Minutes since midnight for a strict "HH:MM", or null for anything else.
function parseMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (match === null) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/** True while `now` is inside the window [start, end); start > end wraps midnight. */
export function isWithinQuietHours(quietHours: QuietHours, now: Date): boolean {
  if (!quietHours.enabled) {
    return false;
  }
  const start = parseMinutes(quietHours.start);
  const end = parseMinutes(quietHours.end);
  // Equal times are an empty window, not a full day — matching [start, end).
  if (start === null || end === null || start === end) {
    return false;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

/** Configure the daily no-nudge window; tracking keeps running through it. */
export function setQuietHours(quietHours: QuietHours): void {
  writeLocal(QUIET_HOURS_KEY, JSON.stringify(quietHours), 'Failed to persist the quiet hours');
  setState({ quietHours });
}

interface GlowShown {
  shown: number;
  monitors: number;
}

function showGlow(): void {
  setState({ glowActive: true });
  invoke<GlowShown>('show_glow')
    .then((result) => {
      // Partial coverage (a display whose overlay failed) keeps the tray warning
      // up — that screen silently gets no nudges until a show fully succeeds.
      const undeliverable = result.shown < result.monitors;
      if (state.glowUndeliverable !== undeliverable) {
        setState({ glowUndeliverable: undeliverable });
      }
    })
    .catch((error) => {
      logCommandFailure('Failed to show the posture glow', error);
      // Roll back so the next sustained streak retries instead of being blocked.
      setState({ glowActive: false });
      // Display sleep legitimately has nowhere to glow; anything else warrants a
      // once-per-session heads-up — an enabled nudge silently never firing is worse.
      const noMonitors = isCommandError(error) && error.kind === 'no_monitors';
      if (noMonitors) {
        return;
      }
      setState({ glowUndeliverable: true });
      if (!warnedGlowUndeliverable) {
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
  if (state.glowPreviewActive) {
    // The preview still owns the windows; it hides them when it stops.
    return;
  }
  invoke('hide_glow').catch((error) => {
    logCommandFailure('Failed to hide the posture glow', error);
    // Roll back only while frames still flow (a retry needs a next sample) — after
    // teardown a stale true would instead wedge the next session's first glow.
    if (state.tracking) {
      setState({ glowActive: true });
    } else {
      // No frames left to retry with; say so rather than leave a stuck vignette
      // silent (needs hide AND destroy to fail natively — see glow.rs).
      useToastStore
        .getState()
        .error("Couldn't clear the posture glow — restart Cuewise if it lingers.");
    }
  });
}

function writePausedUntil(value: NudgePause | null): void {
  const persisted = value === null ? null : String(value);
  writeLocal(NUDGES_PAUSED_KEY, persisted, 'Failed to persist the nudge pause');
  setState({ nudgesPausedUntil: value });
}

/** Silence glow nudges for N minutes (or until resumed); tracking keeps running. */
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
  if (
    !state.nudgesEnabled ||
    state.nudgesPausedUntil !== null ||
    isFocusSessionActive() ||
    isWithinQuietHours(state.quietHours, new Date())
  ) {
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
  if (poorStreak >= nudgeThresholdSamples()) {
    poorStreak = 0;
    showGlow();
  }
}

/** Set how long poor posture must persist before the glow shows. */
export function setNudgeDelay(seconds: NudgeDelaySeconds): void {
  writeLocal(NUDGE_DELAY_KEY, String(seconds), 'Failed to persist the nudge delay');
  // Restart the count: shortening the delay must never fire off an old streak.
  poorStreak = 0;
  setState({ nudgeDelaySeconds: seconds });
}

// Only the glow prefs read back from storage, so a failed write visibly snaps
// the control — this toast says what the user is actually left with.
const SAVE_FAILED_WARNING = "Couldn't save the setting — showing what's in effect instead.";

/** Set how much lean counts as slouching; applies to the live session too. */
export function setNudgeSensitivity(sensitivity: NudgeSensitivity): void {
  writeLocal(SENSITIVITY_KEY, sensitivity, 'Failed to persist the nudge sensitivity');
  setState({ nudgeSensitivity: sensitivity });
  applySensitivity();
}

// A fresh sidecar process boots with default thresholds, so every start re-sends
// the persisted preset (a no-op for 'balanced').
function applySensitivity(): void {
  if (!state.tracking) {
    return;
  }
  invoke('set_posture_sensitivity', { preset: state.nudgeSensitivity }).catch((error) => {
    logCommandFailure('Failed to apply the posture sensitivity', error);
    useToastStore
      .getState()
      .warning("Couldn't apply the sensitivity — readings may use the previous setting.");
  });
}

/** Set the glow strength; the glow windows read it from localStorage on show. */
export function setGlowIntensity(intensity: GlowIntensity): void {
  const persisted = writeLocal(
    GLOW_INTENSITY_KEY,
    intensity,
    'Failed to persist the glow intensity'
  );
  // The glow windows read localStorage, not this state — reflect what actually
  // persisted so Settings can't show a strength the overlays won't use.
  setState({ glowIntensity: readGlowIntensity() });
  if (!persisted) {
    useToastStore.getState().warning(SAVE_FAILED_WARNING);
  }
}

/** Set the nudge style; persisted and read back exactly like the intensity above. */
export function setGlowStyle(style: GlowStyle): void {
  const persisted = writeLocal(GLOW_STYLE_KEY, style, 'Failed to persist the glow style');
  setState({ glowStyle: readGlowStyle() });
  if (!persisted) {
    useToastStore.getState().warning(SAVE_FAILED_WARNING);
  }
}

/** Show the glow on demand (Settings preview). Works with tracking off too. */
export function startGlowPreview(): void {
  if (state.glowPreviewActive) {
    return;
  }
  setState({ glowPreviewActive: true });
  invoke('show_glow').catch((error) => {
    logCommandFailure('Failed to show the glow preview', error);
    setState({ glowPreviewActive: false });
    // User-initiated with an expected visual — a silent no-show reads as broken.
    useToastStore.getState().warning("Couldn't show the glow preview — please try again.");
  });
}

/** End the preview; the windows stay if a real nudge glow still owns them. */
export function stopGlowPreview(): void {
  if (!state.glowPreviewActive) {
    return;
  }
  setState({ glowPreviewActive: false });
  if (state.glowActive) {
    return;
  }
  invoke('hide_glow').catch((error) => {
    logCommandFailure('Failed to hide the glow preview', error);
    // Same no-retry situation as a teardown hide — say so rather than strand a
    // stuck vignette behind a button that now reads "Preview".
    useToastStore
      .getState()
      .error("Couldn't clear the posture glow — restart Cuewise if it lingers.");
  });
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
