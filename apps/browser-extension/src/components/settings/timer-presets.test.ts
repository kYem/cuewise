import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { matchesPreset, TIMER_PRESETS } from './timer-presets';

describe('timer-presets', () => {
  it('includes a Deep work rhythm of 50/10/25 after 2', () => {
    const deep = TIMER_PRESETS.find((p) => p.id === 'deep');
    expect(deep).toMatchObject({ name: 'Deep work', work: 50, short: 10, long: 25, after: 2 });
  });

  it('matchesPreset is true when all four durations match', () => {
    const deep = TIMER_PRESETS.find((p) => p.id === 'deep');
    if (!deep) {
      throw new Error('deep preset missing');
    }
    const s = {
      ...DEFAULT_SETTINGS,
      pomodoroWorkDuration: 50,
      pomodoroBreakDuration: 10,
      pomodoroLongBreakDuration: 25,
      pomodoroLongBreakInterval: 2,
    };
    expect(matchesPreset(s, deep)).toBe(true);
  });

  it('matchesPreset is false when one duration differs', () => {
    const deep = TIMER_PRESETS.find((p) => p.id === 'deep');
    if (!deep) {
      throw new Error('deep preset missing');
    }
    const s = {
      ...DEFAULT_SETTINGS,
      pomodoroWorkDuration: 50,
      pomodoroBreakDuration: 5,
      pomodoroLongBreakDuration: 25,
      pomodoroLongBreakInterval: 2,
    };
    expect(matchesPreset(s, deep)).toBe(false);
  });
});
