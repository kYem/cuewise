import { getNotifier, logger, type PostureSample } from '@cuewise/shared';
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
  error: string | null;
}

let state: PostureState = { tracking: false, nudgesEnabled: true, sample: null, error: null };
const subscribers = new Set<() => void>();
let unlisteners: UnlistenFn[] = [];

// Nudge on sustained poor posture, then cool down so we don't nag.
const NUDGE_AFTER_POOR_SAMPLES = 15; // ~30s at the sidecar's 2s cadence
const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
let poorStreak = 0;
let lastNudgeAt = 0;

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

async function attachListeners(): Promise<void> {
  const onSample = await listen<string>('posture://sample', (event) => {
    try {
      const sample = JSON.parse(event.payload) as PostureSample;
      setState({ sample });
      maybeNudge(sample);
    } catch (error) {
      logger.error('Failed to parse posture sample', error);
    }
  });
  const onStopped = await listen('posture://stopped', () => {
    detachListeners();
    setState({
      tracking: false,
      sample: null,
      error: 'Posture tracking stopped — camera unavailable or permission denied.',
    });
  });
  unlisteners = [onSample, onStopped];
}

export function startPosture(): void {
  if (state.tracking) {
    return;
  }
  setState({ error: null });
  invoke('start_posture')
    .then(() => attachListeners())
    .then(() => setState({ tracking: true }))
    .catch((error) => {
      logger.error('Failed to start posture tracking', error);
      setState({ error: 'Could not start posture tracking.' });
    });
}

export function stopPosture(): void {
  invoke('stop_posture').catch((error) => logger.error('Failed to stop posture tracking', error));
  detachListeners();
  poorStreak = 0;
  setState({ tracking: false, sample: null });
}

export function calibratePosture(): void {
  invoke('calibrate_posture').catch((error) => logger.error('Failed to calibrate posture', error));
}

/** Toggle the "remind me when I slouch" nudges. */
export function setPostureNudges(enabled: boolean): void {
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
    .catch((error) => logger.error('Failed to deliver posture nudge', error));
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
