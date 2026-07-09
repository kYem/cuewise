import { DEFAULT_SETTINGS, POMODORO_DURATION_BOUNDS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { applyPreset, matchesPreset, pomodoroWorkStep, TIMER_PRESETS } from './timer-presets';

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

  it('matchesPreset is false when any single field differs', () => {
    const deep = TIMER_PRESETS.find((p) => p.id === 'deep');
    if (!deep) {
      throw new Error('deep preset missing');
    }
    const match = {
      ...DEFAULT_SETTINGS,
      pomodoroWorkDuration: 50,
      pomodoroBreakDuration: 10,
      pomodoroLongBreakDuration: 25,
      pomodoroLongBreakInterval: 2,
    };
    expect(matchesPreset({ ...match, pomodoroWorkDuration: 45 }, deep)).toBe(false);
    expect(matchesPreset({ ...match, pomodoroBreakDuration: 5 }, deep)).toBe(false);
    expect(matchesPreset({ ...match, pomodoroLongBreakDuration: 20 }, deep)).toBe(false);
    expect(matchesPreset({ ...match, pomodoroLongBreakInterval: 4 }, deep)).toBe(false);
  });

  it('applyPreset maps a rhythm to the four Settings keys', () => {
    const deep = TIMER_PRESETS.find((p) => p.id === 'deep');
    if (!deep) {
      throw new Error('deep preset missing');
    }
    expect(applyPreset(deep)).toEqual({
      pomodoroWorkDuration: 50,
      pomodoroBreakDuration: 10,
      pomodoroLongBreakDuration: 25,
      pomodoroLongBreakInterval: 2,
    });
  });

  // A preset outside these bounds would be stored clamped and then never match
  // itself (matchesPreset uses ===), silently rendering as "Custom".
  it('keeps every preset within POMODORO_DURATION_BOUNDS', () => {
    const b = POMODORO_DURATION_BOUNDS;
    for (const p of TIMER_PRESETS) {
      expect(p.work).toBeGreaterThanOrEqual(b.pomodoroWorkDuration.min);
      expect(p.work).toBeLessThanOrEqual(b.pomodoroWorkDuration.max);
      expect(p.short).toBeGreaterThanOrEqual(b.pomodoroBreakDuration.min);
      expect(p.short).toBeLessThanOrEqual(b.pomodoroBreakDuration.max);
      expect(p.long).toBeGreaterThanOrEqual(b.pomodoroLongBreakDuration.min);
      expect(p.long).toBeLessThanOrEqual(b.pomodoroLongBreakDuration.max);
      expect(p.after).toBeGreaterThanOrEqual(b.pomodoroLongBreakInterval.min);
      expect(p.after).toBeLessThanOrEqual(b.pomodoroLongBreakInterval.max);
    }
  });

  it('pomodoroWorkStep is coarse (5) from 20 up and fine (1) below', () => {
    expect(pomodoroWorkStep(19)).toBe(1);
    expect(pomodoroWorkStep(20)).toBe(5);
    expect(pomodoroWorkStep(25)).toBe(5);
  });

  it('every bounds entry has min <= max', () => {
    for (const { min, max } of Object.values(POMODORO_DURATION_BOUNDS)) {
      expect(min).toBeLessThanOrEqual(max);
    }
  });

  it('every preset round-trips: applying it then matching it returns true', () => {
    // Guards the short-name (work/short/long/after) → Settings-key mapping: applyPreset
    // (write) and matchesPreset (read) must agree, or a preset applies but shows Custom.
    for (const p of TIMER_PRESETS) {
      expect(matchesPreset({ ...DEFAULT_SETTINGS, ...applyPreset(p) }, p)).toBe(true);
    }
  });
});
