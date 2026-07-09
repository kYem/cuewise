import { describe, expect, it } from 'vitest';
import { quoteIntervalToSeconds } from './settings-interval';

describe('quoteIntervalToSeconds', () => {
  it('keeps an in-range seconds entry as-is', () => {
    expect(quoteIntervalToSeconds('45', 'sec')).toBe(45);
  });

  it('clamps a sub-minimum seconds entry up to 10', () => {
    expect(quoteIntervalToSeconds('5', 'sec')).toBe(10);
  });

  it('clamps an over-maximum seconds entry down to 3600', () => {
    expect(quoteIntervalToSeconds('5000', 'sec')).toBe(3600);
  });

  it('converts minutes to seconds', () => {
    expect(quoteIntervalToSeconds('2', 'min')).toBe(120);
  });

  it('clamps an over-maximum minutes entry down to 3600', () => {
    expect(quoteIntervalToSeconds('120', 'min')).toBe(3600);
  });

  it('rounds fractional seconds before clamping', () => {
    expect(quoteIntervalToSeconds('12.7', 'sec')).toBe(13);
  });

  it('rounds fractional minutes before converting', () => {
    expect(quoteIntervalToSeconds('1.4', 'min')).toBe(60);
  });

  it('returns null for an empty entry so the value is left untouched', () => {
    expect(quoteIntervalToSeconds('', 'sec')).toBeNull();
  });

  it('returns null for a whitespace-only entry', () => {
    expect(quoteIntervalToSeconds('   ', 'min')).toBeNull();
  });

  it('returns null for a non-numeric entry', () => {
    expect(quoteIntervalToSeconds('abc', 'sec')).toBeNull();
  });
});
