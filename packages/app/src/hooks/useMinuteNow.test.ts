import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMinuteNow } from './useMinuteNow';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:45Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMinuteNow', () => {
  it('holds the time until the minute turns over', () => {
    const { result } = renderHook(() => useMinuteNow());

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.toISOString()).toBe('2026-06-15T12:00:45.000Z');
  });

  it('updates on the next minute boundary and every minute after', () => {
    const { result } = renderHook(() => useMinuteNow());

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.toISOString()).toBe('2026-06-15T12:01:00.000Z');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.toISOString()).toBe('2026-06-15T12:02:00.000Z');
  });
});
