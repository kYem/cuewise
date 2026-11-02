import { describe, expect, it } from 'vitest';
import { clampPomodoroDurations } from './settings-clamps';

describe('clampPomodoroDurations', () => {
  it('clamps each rhythm field to its bounds', () => {
    expect(
      clampPomodoroDurations({
        pomodoroWorkDuration: 999,
        pomodoroBreakDuration: 0,
        pomodoroLongBreakDuration: 5,
        pomodoroLongBreakInterval: 50,
      })
    ).toEqual({
      pomodoroWorkDuration: 60,
      pomodoroBreakDuration: 1,
      pomodoroLongBreakDuration: 10,
      pomodoroLongBreakInterval: 10,
    });
  });

  it('rounds fractional values and leaves in-range values untouched', () => {
    expect(clampPomodoroDurations({ pomodoroWorkDuration: 25.4 })).toEqual({
      pomodoroWorkDuration: 25,
    });
    expect(clampPomodoroDurations({ pomodoroBreakDuration: 5 })).toEqual({
      pomodoroBreakDuration: 5,
    });
  });

  it('passes non-pomodoro keys through untouched', () => {
    expect(clampPomodoroDurations({ colorTheme: 'forest' })).toEqual({ colorTheme: 'forest' });
  });

  it('coerces NaN to the lower bound instead of persisting it', () => {
    expect(clampPomodoroDurations({ pomodoroWorkDuration: Number.NaN })).toEqual({
      pomodoroWorkDuration: 1,
    });
  });
});
