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
// True while a start_posture spawn is in flight, so a rapid re-toggle can't
// double-attach listeners (a leak) and double-count every sample.
let starting = false;
let parseFailures = 0;

// Nudge on sustained poor posture, then cool down so we don't nag.
const NUDGE_AFTER_POOR_SAMPLES = 15; // ~30s at the sidecar's 2s cadence
const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
let poorStreak = 0;
let lastNudgeAt = 0;

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
}

async function attachListeners(): Promise<void> {
  detachListeners(); // guard against a double-attach orphaning the previous pair
  const onSample = await listen<string>('posture://sample', (event) => {
    let sample: PostureSample;
    try {
      sample = JSON.parse(event.payload) as PostureSample;
    } catch (error) {
      // Only the parse is fragile; a downstream throw must not read as "bad frame".
      logger.error('Failed to parse posture sample', error);
      parseFailures += 1;
      if (parseFailures >= 5) {
        setState({ error: 'Posture readings could not be read.' });
      }
      return;
    }
    parseFailures = 0;
    setState({ sample });
    maybeNudge(sample);
    updateSteadyStatus(sample.status);
  });
  const onStopped = await listen('posture://stopped', () => {
    detachListeners();
    resetDerivation();
    setState({
      tracking: false,
      sample: null,
      steadyStatus: null,
      error: 'Posture tracking stopped — camera unavailable or permission denied.',
    });
  });
  unlisteners = [onSample, onStopped];
}

export function startPosture(): void {
  // `tracking` only flips true once the async spawn resolves, so guard the
  // in-flight window too or a second toggle double-attaches and double-counts.
  if (state.tracking || starting) {
    return;
  }
  starting = true;
  persist(ENABLED_KEY, true);
  setState({ error: null });
  invoke('start_posture')
    .then(() => attachListeners())
    .then(() => setState({ tracking: true }))
    .catch((error) => {
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
  persist(ENABLED_KEY, false);
  invoke('stop_posture').catch((error) => logger.error('Failed to stop posture tracking', error));
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
  invoke('calibrate_posture').catch((error) => logger.error('Failed to calibrate posture', error));
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
