import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDayChange } from './useDayChange';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('useDayChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor mid-day so one minute of ticking never crosses midnight by itself.
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once when the interval check crosses midnight', () => {
    const onDayChange = vi.fn();
    renderHook(() => useDayChange(onDayChange));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDayChange).not.toHaveBeenCalled();

    act(() => {
      vi.setSystemTime(new Date('2026-07-16T00:00:30'));
      vi.advanceTimersByTime(60_000);
    });
    expect(onDayChange).toHaveBeenCalledOnce();

    // Same day again a minute later — no re-fire.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDayChange).toHaveBeenCalledOnce();
  });

  it('fires on tab foregrounding after sleeping past midnight', () => {
    const onDayChange = vi.fn();
    renderHook(() => useDayChange(onDayChange));

    act(() => {
      // Backgrounded laptop: no interval ticks, the clock just jumps a day.
      vi.setSystemTime(Date.now() + DAY_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onDayChange).toHaveBeenCalledOnce();
  });

  it('stops checking after unmount', () => {
    const onDayChange = vi.fn();
    const { unmount } = renderHook(() => useDayChange(onDayChange));

    unmount();
    act(() => {
      vi.setSystemTime(Date.now() + DAY_MS);
      vi.advanceTimersByTime(120_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onDayChange).not.toHaveBeenCalled();
  });
});
