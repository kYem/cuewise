import { DAY_IN_MS, logger } from '@cuewise/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDayChange } from './useDayChange';

describe('useDayChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor mid-day so one minute of ticking never crosses midnight by itself.
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once when the interval check crosses midnight', async () => {
    const onDayChange = vi.fn();
    renderHook(() => useDayChange(onDayChange));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDayChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.setSystemTime(new Date('2026-07-16T00:00:30'));
      vi.advanceTimersByTime(60_000);
    });
    expect(onDayChange).toHaveBeenCalledOnce();

    // Same day again a minute later — no re-fire.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDayChange).toHaveBeenCalledOnce();
  });

  it('fires on tab foregrounding after sleeping past midnight', async () => {
    const onDayChange = vi.fn();
    renderHook(() => useDayChange(onDayChange));

    await act(async () => {
      // Backgrounded laptop: no interval ticks, the clock just jumps a day.
      vi.setSystemTime(Date.now() + DAY_IN_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onDayChange).toHaveBeenCalledOnce();
  });

  it('logs instead of leaking when the callback rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const onDayChange = vi.fn(async () => {
      throw new Error('rollover failed');
    });
    renderHook(() => useDayChange(onDayChange));

    await act(async () => {
      vi.setSystemTime(Date.now() + DAY_IN_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onDayChange).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith('Day-change callback failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('stops checking after unmount', () => {
    const onDayChange = vi.fn();
    const { unmount } = renderHook(() => useDayChange(onDayChange));

    unmount();
    act(() => {
      vi.setSystemTime(Date.now() + DAY_IN_MS);
      vi.advanceTimersByTime(120_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onDayChange).not.toHaveBeenCalled();
  });
});
