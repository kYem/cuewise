import { logger } from '@cuewise/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStaleRefresh } from './useStaleRefresh';

const WINDOW_MS = 30 * 60 * 1000;

describe('useStaleRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A reading taken `minutes` ago, in the shape the store keeps it. */
  function readingFrom(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }

  function hideTab(hidden: boolean): void {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
  }

  it('fires once the reading passes the window', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(30), WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onStale).toHaveBeenCalledOnce();
  });

  it('leaves a reading still inside the window alone', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(5), WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onStale).not.toHaveBeenCalled();
  });

  it('fires on foregrounding a tab that slept past the window', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(5), WINDOW_MS, onStale));

    await act(async () => {
      vi.setSystemTime(Date.now() + WINDOW_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onStale).toHaveBeenCalledOnce();
  });

  // Provider quota spent on a tab nobody is looking at.
  it('stays put while the tab is hidden', async () => {
    hideTab(true);
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(60), WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onStale).not.toHaveBeenCalled();
  });

  // A failure leaves the reading stale, so the trigger stays armed: without this the
  // hook would retry every minute for as long as the proxy is down.
  it('waits another window after an attempt that changed nothing', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(31), WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onStale).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(onStale).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(WINDOW_MS);
    });
    expect(onStale).toHaveBeenCalledTimes(2);
  });

  it('does nothing before the first reading has landed', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(null, WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(WINDOW_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onStale).not.toHaveBeenCalled();
  });

  it('logs instead of leaking when the callback rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const onStale = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    renderHook(() => useStaleRefresh(readingFrom(31), WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(errorSpy).toHaveBeenCalledWith('Stale-refresh callback failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('stops checking after unmount', async () => {
    const onStale = vi.fn();
    const { unmount } = renderHook(() => useStaleRefresh(readingFrom(31), WINDOW_MS, onStale));

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(WINDOW_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onStale).not.toHaveBeenCalled();
  });
});
