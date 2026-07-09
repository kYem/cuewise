import type { Settings } from '@cuewise/shared';

export interface TimerPreset {
  id: string;
  name: string;
  work: number;
  short: number;
  long: number;
  after: number;
}

/** Session rhythm recipes (work · short break · long break, in minutes). */
export const TIMER_PRESETS: readonly TimerPreset[] = [
  { id: 'classic', name: 'Classic', work: 25, short: 5, long: 15, after: 4 },
  { id: 'deep', name: 'Deep work', work: 50, short: 10, long: 25, after: 2 },
  { id: 'sprint', name: 'Quick sprint', work: 15, short: 3, long: 12, after: 4 },
];

export function matchesPreset(s: Settings, p: TimerPreset): boolean {
  return (
    s.pomodoroWorkDuration === p.work &&
    s.pomodoroBreakDuration === p.short &&
    s.pomodoroLongBreakDuration === p.long &&
    s.pomodoroLongBreakInterval === p.after
  );
}

/** The Settings patch that applies a preset's rhythm. Kept beside matchesPreset
 * so the read (match) and write (apply) mappings can't drift apart. */
export function applyPreset(p: TimerPreset): Partial<Settings> {
  return {
    pomodoroWorkDuration: p.work,
    pomodoroBreakDuration: p.short,
    pomodoroLongBreakDuration: p.long,
    pomodoroLongBreakInterval: p.after,
  };
}

/** Focus-duration step: coarse (5) from 20 minutes up, fine (1) below. Shared by
 * the Settings page and the timer popover so they can't step focus differently. */
export function pomodoroWorkStep(workDuration: number): number {
  return workDuration >= 20 ? 5 : 1;
}
