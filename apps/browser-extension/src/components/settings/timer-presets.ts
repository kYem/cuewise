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
export const TIMER_PRESETS: TimerPreset[] = [
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
