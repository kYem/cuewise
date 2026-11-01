import { BACKGROUND_EFFECT_BOUNDS, MAX_NOTE_LENGTH, POMODORO_DURATION_BOUNDS } from './constants';
import { logger } from './logger';
import type { Settings } from './types';

/**
 * Clamp any pomodoro rhythm fields present in a settings patch to their valid
 * bounds (POMODORO_DURATION_BOUNDS). Applied by updateSettings, so anything writing
 * durations through the settings store — presets, steppers, a future settings
 * import — can't persist an out-of-range value. The UI steppers also clamp on click;
 * this is the store-side backstop.
 */
export function clampPomodoroDurations(patch: Partial<Settings>): Partial<Settings> {
  const clamp = (value: number, min: number, max: number): number => {
    const rounded = Math.round(value);
    if (Number.isNaN(rounded)) {
      // NaN isn't out-of-range, it's a corruption signal (bad import / storage read);
      // heal it to the lower bound but leave a breadcrumb rather than silently reset.
      logger.warn('clampPomodoroDurations: coercing a NaN duration to its minimum', { min });
      return min;
    }
    return Math.min(max, Math.max(min, rounded));
  };
  const out: Partial<Settings> = { ...patch };
  const b = POMODORO_DURATION_BOUNDS;
  if (typeof out.pomodoroWorkDuration === 'number') {
    out.pomodoroWorkDuration = clamp(
      out.pomodoroWorkDuration,
      b.pomodoroWorkDuration.min,
      b.pomodoroWorkDuration.max
    );
  }
  if (typeof out.pomodoroBreakDuration === 'number') {
    out.pomodoroBreakDuration = clamp(
      out.pomodoroBreakDuration,
      b.pomodoroBreakDuration.min,
      b.pomodoroBreakDuration.max
    );
  }
  if (typeof out.pomodoroLongBreakDuration === 'number') {
    out.pomodoroLongBreakDuration = clamp(
      out.pomodoroLongBreakDuration,
      b.pomodoroLongBreakDuration.min,
      b.pomodoroLongBreakDuration.max
    );
  }
  if (typeof out.pomodoroLongBreakInterval === 'number') {
    out.pomodoroLongBreakInterval = clamp(
      out.pomodoroLongBreakInterval,
      b.pomodoroLongBreakInterval.min,
      b.pomodoroLongBreakInterval.max
    );
  }
  return out;
}

/**
 * Clamp background dim/blur on the UI settings write path, so presets and a future
 * settings import can't persist an out-of-range value (render clamps too, but
 * stored data should honor the BACKGROUND_EFFECT_BOUNDS contract).
 */
export function clampBackgroundEffects(patch: Partial<Settings>): Partial<Settings> {
  const clamp = (value: number, min: number, max: number): number => {
    const rounded = Math.round(value);
    if (Number.isNaN(rounded)) {
      // NaN isn't out-of-range, it's a corruption signal; heal it with a breadcrumb.
      logger.warn('clampBackgroundEffects: coercing a NaN effect value to its minimum', { min });
      return min;
    }
    return Math.min(max, Math.max(min, rounded));
  };
  const out: Partial<Settings> = { ...patch };
  const b = BACKGROUND_EFFECT_BOUNDS;
  if (typeof out.backgroundDim === 'number') {
    out.backgroundDim = clamp(out.backgroundDim, b.backgroundDim.min, b.backgroundDim.max);
  }
  if (typeof out.backgroundBlur === 'number') {
    out.backgroundBlur = clamp(out.backgroundBlur, b.backgroundBlur.min, b.backgroundBlur.max);
  }
  return out;
}

/**
 * Cut a note to MAX_NOTE_LENGTH without splitting a surrogate pair: half an emoji is an
 * ill-formed string, which the sync crypto path silently rewrites to U+FFFD.
 */
export function truncateNote(value: string): string {
  if (value.length <= MAX_NOTE_LENGTH) {
    return value;
  }
  const cut = value.slice(0, MAX_NOTE_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    return cut.slice(0, -1);
  }
  return cut;
}

/**
 * Store-side backstop on the settings write path: no writer can persist a note whose sync
 * record exceeds the server's ciphertext limit and wedges every later push.
 */
export function clampNoteLength(patch: Partial<Settings>): Partial<Settings> {
  if (typeof patch.note !== 'string' || patch.note.length <= MAX_NOTE_LENGTH) {
    return patch;
  }
  return { ...patch, note: truncateNote(patch.note) };
}
