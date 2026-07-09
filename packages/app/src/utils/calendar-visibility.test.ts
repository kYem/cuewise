import { describe, expect, it } from 'vitest';
import { resolveNewTabCalendar, resolvePomodoroCompanion } from './calendar-visibility';

describe('resolvePomodoroCompanion', () => {
  it('passes the setting through when the feature is enabled', () => {
    expect(resolvePomodoroCompanion('calendar', true)).toBe('calendar');
    expect(resolvePomodoroCompanion('both', true)).toBe('both');
    expect(resolvePomodoroCompanion('quote', true)).toBe('quote');
  });

  it('falls back to quote for every setting when the feature is disabled', () => {
    expect(resolvePomodoroCompanion('calendar', false)).toBe('quote');
    expect(resolvePomodoroCompanion('both', false)).toBe('quote');
    expect(resolvePomodoroCompanion('quote', false)).toBe('quote');
  });
});

describe('resolveNewTabCalendar', () => {
  it('shows the strip only when both the feature and the toggle are on', () => {
    const settings = { newTabShowCalendar: true, newTabCalendarPosition: 'above' as const };
    expect(resolveNewTabCalendar(settings, true).show).toBe(true);
  });

  it('hides the strip when the feature is disabled even if the toggle is on', () => {
    const settings = { newTabShowCalendar: true, newTabCalendarPosition: 'below' as const };
    expect(resolveNewTabCalendar(settings, false).show).toBe(false);
  });

  it('hides the strip when the toggle is off even if the feature is enabled', () => {
    const settings = { newTabShowCalendar: false, newTabCalendarPosition: 'above' as const };
    expect(resolveNewTabCalendar(settings, true).show).toBe(false);
  });

  it('passes the position through regardless of visibility', () => {
    const hidden = { newTabShowCalendar: false, newTabCalendarPosition: 'above' as const };
    expect(resolveNewTabCalendar(hidden, false).position).toBe('above');
    const shown = { newTabShowCalendar: true, newTabCalendarPosition: 'below' as const };
    expect(resolveNewTabCalendar(shown, true).position).toBe('below');
  });
});
