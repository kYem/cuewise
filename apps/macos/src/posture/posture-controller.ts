import { useToastStore } from '@cuewise/app';
import { getNotifier, logger, type PostureSample, type PostureStatus } from '@cuewise/shared';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';

// Module-level posture state. Tracking outlives the Settings section (which only
// mounts while open), so the sidecar keeps running — and the toggle stays truthful
// — after Settings closes. All @tauri-apps usage is macOS-local, here and in the
// section that renders this.

export interface PostureState {
  tracking: boolean;
  nudgesEnabled: boolean;
  sample: PostureSample | null;
  // Debounced status for the menu-bar tray — changes only once a status holds, so
  // the tray doesn't flicker on frame-to-frame jitter (Settings uses live `sample`).
  steadyStatus: PostureStatus | null;
  error: string | null;
}

let state: PostureState = {
  tracking: false,
  nudgesEnabled: true,
  sample: null,
  steadyStatus: null,
  error: null,
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

// Nudge on sustained poor posture, then cool down so we don't nag.
const NUDGE_AFTER_POOR_SAMPLES = 15; // ~30s at the sidecar's 2s cadence
const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
let poorStreak = 0;
let lastNudgeAt = 0;
// Warn the user once per tracking session when a failure would otherwise be silent,
// without storming a toast on every retry. Both reset in resetDerivation.
let warnedNudgeUndeliverable = false;
let warnedUnreadable = false;

// Debounce the tray status: adopt a new status only after it holds for a few
// samples, so a dropped face-detection frame or threshold jitter doesn't flip the
// menu bar. Alternating statuses never hold, so the tray stays put.
const STEADY_SAMPLES = 3; // ~6s at the sidecar's 2s cadence
let pendingStatus: PostureStatus | null = null;
let pendingCount = 0;

// Persist the opt-in preferences (macOS-local) so the toggles stick across launches.
const ENABLED_KEY = 'cuewise.posture.enabled';
const NUDGES_KEY = 'cuewise.posture.nudges';

function persist(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch (error) {
    logger.error('Failed to persist posture preference', error);
  }
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

// Zero the per-session derivation counters so a new session starts clean. Both
// stop paths must call this, or a stale poorStreak can nudge early after resume.
function resetDerivation(): void {
  poorStreak = 0;
  pendingStatus = null;
  pendingCount = 0;
  parseFailures = 0;
  // Per-session warn latches reset with the session, so a deliberate restart can
  // warn again if the problem persists.
  warnedNudgeUndeliverable = false;
  warnedUnreadable = false;
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
    maybeNudge(sample);
    updateSteadyStatus(sample.status);
  });
  let onStopped: UnlistenFn;
  try {
    onStopped = await listen('posture://stopped', () => {
      // Reached only for an *unexpected* stop (stopPosture detaches first), so surface
      // the camera/permission failure even with Settings closed. The pref is kept — the
      // camera may be transiently busy — so tracking can still auto-resume next boot.
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
      logger.error('Failed to start posture tracking', error);
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
  invoke('stop_posture').catch((error) => {
    logger.error('Failed to stop posture tracking', error);
    useToastStore.getState().error("Couldn't stop posture tracking — the camera may still be on.");
  });
  detachListeners();
  resetDerivation();
  setState({ tracking: false, sample: null, steadyStatus: null });
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
    if (localStorage.getItem(ENABLED_KEY) === '1') {
      startPosture();
    }
  } catch (error) {
    logger.error('Failed to restore posture preferences', error);
  }
}

export function calibratePosture(): void {
  invoke('calibrate_posture').catch((error) => {
    logger.error('Failed to calibrate posture', error);
    useToastStore.getState().error("Couldn't calibrate posture — please try again.");
  });
}

/** Toggle the "remind me when I slouch" nudges. */
export function setPostureNudges(enabled: boolean): void {
  persist(NUDGES_KEY, enabled);
  poorStreak = 0;
  setState({ nudgesEnabled: enabled });
}

// Fire a gentle nudge once poor posture has persisted, then hold off for a while.
function maybeNudge(sample: PostureSample): void {
  if (!state.nudgesEnabled || sample.status !== 'poor') {
    poorStreak = 0;
    return;
  }
  poorStreak += 1;
  const now = Date.now();
  if (poorStreak < NUDGE_AFTER_POOR_SAMPLES || now - lastNudgeAt < NUDGE_COOLDOWN_MS) {
    return;
  }
  lastNudgeAt = now;
  poorStreak = 0;
  getNotifier()
    .notify({
      id: 'posture-nudge',
      title: '🧍 Posture check',
      body: "You've been leaning in for a while — sit back and reset.",
    })
    .catch((error) => {
      logger.error('Failed to deliver posture nudge', error);
      lastNudgeAt = 0; // delivery failed — don't spend the cooldown on a missed nudge
      if (!warnedNudgeUndeliverable) {
        warnedNudgeUndeliverable = true;
        useToastStore
          .getState()
          .warning("Couldn't deliver a posture reminder — check notification permissions.");
      }
    });
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

/** Subscribe a component to the shared posture state. */
export function usePosture(): PostureState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
