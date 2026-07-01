import { describe, expect, it } from 'vitest';
import { addTag, clampPomodoroDurations, uniqueSorted } from './utils';

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

describe('uniqueSorted', () => {
  it('dedupes and locale-sorts, dropping falsy values', () => {
    expect(uniqueSorted(['b', 'a', 'b', '', undefined, null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for all-falsy input', () => {
    expect(uniqueSorted([undefined, null, ''])).toEqual([]);
  });
});

describe('addTag', () => {
  it('appends a trimmed tag', () => {
    expect(addTag(['a'], '  b  ')).toEqual(['a', 'b']);
  });

  it('strips a trailing comma', () => {
    expect(addTag([], 'redis,')).toEqual(['redis']);
  });

  it('dedupes case-insensitively, keeping the existing tag', () => {
    expect(addTag(['HTTP'], 'http')).toEqual(['HTTP']);
  });

  it('returns the same array (no-op) for empty/whitespace/comma-only input', () => {
    const tags = ['a'];
    expect(addTag(tags, '   ')).toBe(tags);
    expect(addTag(tags, ',')).toBe(tags);
  });
});
