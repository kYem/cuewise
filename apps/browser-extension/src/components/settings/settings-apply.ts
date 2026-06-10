import type { Settings } from '@cuewise/shared';

/** Timer/sound settings that must be re-read into the Pomodoro store after a change. */
export const POMODORO_KEYS: (keyof Settings)[] = [
  'pomodoroWorkDuration',
  'pomodoroBreakDuration',
  'pomodoroLongBreakDuration',
  'pomodoroLongBreakInterval',
  'pomodoroStartSound',
  'pomodoroCompletionSound',
];

export interface SettingsSideEffects {
  /** Reload the page (sync swaps the storage backend; re-read from the new area). */
  reload: boolean;
  /** Re-read timer settings so a Pomodoro session picks up the change. */
  reloadPomodoro: boolean;
}

/**
 * Decide which side effects an instant-save patch needs, given the sync flag
 * before the write and the value the store actually holds after it.
 * A sync toggle reloads only if it persisted — a failed migration leaves the
 * flag unchanged, and reloading then would wipe the error toast that explains why.
 */
export function planSettingsSideEffects(
  patch: Partial<Settings>,
  prevSyncEnabled: boolean,
  nextSyncEnabled: boolean
): SettingsSideEffects {
  const syncChanging = 'syncEnabled' in patch && patch.syncEnabled !== prevSyncEnabled;
  if (syncChanging) {
    return { reload: nextSyncEnabled === patch.syncEnabled, reloadPomodoro: false };
  }
  return { reload: false, reloadPomodoro: POMODORO_KEYS.some((key) => key in patch) };
}
