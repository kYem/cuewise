import { describe, expect, it } from 'vitest';
import { planSettingsSideEffects } from './settings-apply';

describe('planSettingsSideEffects', () => {
  it('reloads when sync is enabled and the toggle persisted', () => {
    expect(planSettingsSideEffects({ syncEnabled: true }, false, true)).toEqual({
      reload: true,
      reloadPomodoro: false,
    });
  });

  it('reloads when sync is disabled and the toggle persisted', () => {
    expect(planSettingsSideEffects({ syncEnabled: false }, true, false)).toEqual({
      reload: true,
      reloadPomodoro: false,
    });
  });

  it('does not reload when a sync migration failed to persist', () => {
    // updateSettings early-returns on a failed migration, leaving syncEnabled unchanged.
    expect(planSettingsSideEffects({ syncEnabled: true }, false, false)).toEqual({
      reload: false,
      reloadPomodoro: false,
    });
  });

  it('does nothing when syncEnabled is set to its current value', () => {
    expect(planSettingsSideEffects({ syncEnabled: false }, false, false)).toEqual({
      reload: false,
      reloadPomodoro: false,
    });
  });

  it('reloads pomodoro settings when a timer field changes', () => {
    expect(planSettingsSideEffects({ pomodoroWorkDuration: 30 }, false, false)).toEqual({
      reload: false,
      reloadPomodoro: true,
    });
  });

  it('reloads pomodoro settings when a sound field changes', () => {
    expect(planSettingsSideEffects({ pomodoroStartSound: 'bell' }, false, false)).toEqual({
      reload: false,
      reloadPomodoro: true,
    });
  });

  it('does not reload pomodoro settings for unrelated changes', () => {
    expect(planSettingsSideEffects({ showClock: true }, false, false)).toEqual({
      reload: false,
      reloadPomodoro: false,
    });
  });

  it('lets a sync reload supersede a co-changed pomodoro field', () => {
    expect(
      planSettingsSideEffects({ syncEnabled: true, pomodoroWorkDuration: 30 }, false, true)
    ).toEqual({ reload: true, reloadPomodoro: false });
  });
});
