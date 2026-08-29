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

  it('stays put while the tab is hidden', async () => {
    hideTab(true);
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(60), WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onStale).not.toHaveBeenCalled();
  });

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

  it('re-arms against the reading that replaces the one it refreshed', async () => {
    const onStale = vi.fn();
    const { rerender } = renderHook(
      ({ at }: { at: string }) => useStaleRefresh(at, WINDOW_MS, onStale),
      { initialProps: { at: readingFrom(31) } }
    );

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onStale).toHaveBeenCalledOnce();

    // The replacement lands well after that attempt, so the two windows stop coinciding —
    // a hook still measuring the reading it started with fires during the next advance.
    await act(async () => {
      vi.advanceTimersByTime(20 * 60_000);
    });
    rerender({ at: new Date().toISOString() });

    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000);
    });
    expect(onStale).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(16 * 60_000);
    });
    expect(onStale).toHaveBeenCalledTimes(2);
  });

  it('fires the callback it was last rendered with', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useStaleRefresh(readingFrom(31), WINDOW_MS, cb),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('stands down, and says so, on a timestamp it cannot read', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh('not a timestamp', WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(WINDOW_MS);
    });

    expect(onStale).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Stale refresh stood down: unparseable timestamp', {
      lastFetch: 'not a timestamp',
    });
    warnSpy.mockRestore();
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
