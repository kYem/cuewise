import { describe, expect, it } from 'vitest';
import { settingsMatch } from './settings-match';

describe('settingsMatch', () => {
  it('matches everything when the filter is empty', () => {
    expect(settingsMatch('', 'Work duration')).toBe(true);
  });

  it('matches everything when the filter is only whitespace', () => {
    expect(settingsMatch('   ', 'anything')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(settingsMatch('WORK', 'Work duration')).toBe(true);
  });

  it('trims the query before matching', () => {
    expect(settingsMatch('  work  ', 'Work duration')).toBe(true);
  });

  it('matches against any of the provided texts, including keywords', () => {
    expect(settingsMatch('pomodoro', 'Work duration', undefined, 'pomodoro focus session')).toBe(
      true
    );
  });

  it('ignores undefined text args without throwing', () => {
    expect(settingsMatch('x', undefined, undefined)).toBe(false);
  });

  it('returns false when no text contains the query', () => {
    expect(settingsMatch('xyz', 'Work duration', 'minutes')).toBe(false);
  });

  it('matches a substring spanning the space-joined texts', () => {
    expect(settingsMatch('duration min', 'duration', 'minutes')).toBe(true);
  });
});
