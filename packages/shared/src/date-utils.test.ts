import { describe, expect, it } from 'vitest';
import {
  formatDateString,
  getDateStringDaysAgo,
  getDateStringDaysFromNow,
  getNextDayDateString,
  getTodayDateString,
  getYesterdayDateString,
} from './date-utils';

// Guards the UTC->local fix: must stay consistent with the sibling local-time helpers,
// not drift back to toISOString() (which is off by a day in some timezones near midnight).
describe('getDateStringDaysAgo', () => {
  it('returns today for 0 days ago', () => {
    expect(getDateStringDaysAgo(0)).toBe(getTodayDateString());
  });

  it('returns yesterday for 1 day ago', () => {
    expect(getDateStringDaysAgo(1)).toBe(getYesterdayDateString());
  });

  it('returns a YYYY-MM-DD string exactly N days before today', () => {
    const result = getDateStringDaysAgo(7);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const daysApart = (Date.parse(getTodayDateString()) - Date.parse(result)) / 86_400_000;
    expect(daysApart).toBe(7);
  });
});

describe('getDateStringDaysFromNow', () => {
  it('returns today for 0 days from now', () => {
    expect(getDateStringDaysFromNow(0)).toBe(getTodayDateString());
  });

  it('returns tomorrow for 1 day from now', () => {
    expect(getDateStringDaysFromNow(1)).toBe(getNextDayDateString());
  });

  it('returns a YYYY-MM-DD string exactly N days after today', () => {
    const result = getDateStringDaysFromNow(7);

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const daysApart = (Date.parse(result) - Date.parse(getTodayDateString())) / 86_400_000;
    expect(daysApart).toBe(7);
  });
});

describe('formatDateString', () => {
  it('formats a Date as a local YYYY-MM-DD string', () => {
    expect(formatDateString(new Date(2025, 0, 5))).toBe('2025-01-05');
  });

  it('matches getTodayDateString for the current date', () => {
    expect(formatDateString(new Date())).toBe(getTodayDateString());
  });
});
