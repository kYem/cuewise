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

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  async function foreground(): Promise<void> {
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  function hideTab(hidden: boolean): void {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
  }

  it('fires once the reading passes the window', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(30), WINDOW_MS, onStale));

    await advance(60_000);

    expect(onStale).toHaveBeenCalledOnce();
  });

  it('leaves a reading still inside the window alone', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(5), WINDOW_MS, onStale));

    await advance(60_000);

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

  it('stays put while the tab is hidden, having spent nothing by the time it returns', async () => {
    hideTab(true);
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(60), WINDOW_MS, onStale));

    await advance(10 * 60_000);
    expect(onStale).not.toHaveBeenCalled();

    hideTab(false);
    await foreground();

    expect(onStale).toHaveBeenCalledOnce();
  });

  it('waits another window after an attempt that changed nothing', async () => {
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(readingFrom(31), WINDOW_MS, onStale));

    await advance(60_000);
    expect(onStale).toHaveBeenCalledOnce();

    await advance(10 * 60_000);
    expect(onStale).toHaveBeenCalledOnce();

    await advance(WINDOW_MS);
    expect(onStale).toHaveBeenCalledTimes(2);
  });

  // The widget flips this input to null on every fetch, so the attempt clock has to outlive
  // the effect that set it — otherwise a failing endpoint is retried every minute.
  it('keeps its attempt clock across a stand-down and re-arm', async () => {
    const onStale = vi.fn();
    const reading = readingFrom(31);
    const { rerender } = renderHook<void, { at: string | null }>(
      ({ at }) => useStaleRefresh(at, WINDOW_MS, onStale),
      { initialProps: { at: reading } }
    );

    await advance(60_000);
    expect(onStale).toHaveBeenCalledOnce();

    rerender({ at: null });
    rerender({ at: reading });
    await advance(10 * 60_000);
    expect(onStale).toHaveBeenCalledOnce();

    await advance(WINDOW_MS);
    expect(onStale).toHaveBeenCalledTimes(2);
  });

  it('re-arms against the reading that replaces the one it refreshed', async () => {
    const onStale = vi.fn();
    const { rerender } = renderHook(
      ({ at }: { at: string }) => useStaleRefresh(at, WINDOW_MS, onStale),
      { initialProps: { at: readingFrom(31) } }
    );

    await advance(60_000);
    expect(onStale).toHaveBeenCalledOnce();

    // The replacement has to land well after the attempt, or the two windows expire
    // together and a hook still measuring its first reading looks identical.
    await advance(20 * 60_000);
    rerender({ at: new Date().toISOString() });

    await advance(15 * 60_000);
    expect(onStale).toHaveBeenCalledOnce();

    await advance(WINDOW_MS);
    expect(onStale).toHaveBeenCalledTimes(2);
  });

  it('fires the callback it was last rendered with', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const reading = readingFrom(31);
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useStaleRefresh(reading, WINDOW_MS, cb),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });
    await advance(60_000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('stands down, and says so, on a timestamp it cannot read', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh('not a timestamp', WINDOW_MS, onStale));

    await advance(WINDOW_MS);

    expect(onStale).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Stale refresh stood down: unparseable timestamp', {
      lastFetch: 'not a timestamp',
    });
  });

  it('does nothing before the first reading has landed', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const onStale = vi.fn();
    renderHook(() => useStaleRefresh(null, WINDOW_MS, onStale));

    await act(async () => {
      vi.advanceTimersByTime(WINDOW_MS);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onStale).not.toHaveBeenCalled();
    // Null is the ordinary state — chip off, or a fetch running — so falling through to the
    // unparseable branch would log an error on every tab.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs instead of leaking when the callback rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const onStale = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    renderHook(() => useStaleRefresh(readingFrom(31), WINDOW_MS, onStale));

    await advance(60_000);

    expect(errorSpy).toHaveBeenCalledWith('Stale-refresh callback failed', expect.any(Error));
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
