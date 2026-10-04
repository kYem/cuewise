import { createSelectorMock, installLockManagerMock } from '@cuewise/test-utils';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));

const LOCK_NAME = 'cuewise-sounds-leader';
// Fresh per test: a finished test's lock hold lets go up to 100ms late, into the mock it captured.
let setIsLeader = vi.fn();
let uninstallLocks: () => void = () => {};

/** Another tab holding the audio; releases its hold when the returned function is called. */
function anotherTabHolds(): () => void {
  let release: () => void = () => {};
  void navigator.locks.request(
    LOCK_NAME,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  return () => release();
}

/** A fresh module per test, since the first grant's answer is remembered once per page. */
async function renderLeader(options: { strict?: boolean } = {}) {
  vi.resetModules();
  const { useSoundsStore } = await import('../stores/sounds-store');
  vi.mocked(useSoundsStore).mockImplementation(createSelectorMock({ setIsLeader }));
  const { useSoundsLeader } = await import('./useSoundsLeader');
  return renderHook(() => useSoundsLeader(), { wrapper: options.strict ? StrictMode : undefined });
}

describe('useSoundsLeader', () => {
  beforeEach(() => {
    setIsLeader = vi.fn();
    uninstallLocks = installLockManagerMock();
  });

  afterEach(() => {
    uninstallLocks();
  });

  it('leads fresh when no other tab held the audio', async () => {
    const { unmount } = await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
    unmount();
  });

  it('takes over, not fresh, once the tab holding the audio lets go', async () => {
    const release = anotherTabHolds();
    const { unmount } = await renderLeader();

    release();

    await waitFor(() =>
      expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: false, ambientSounding: false })
    );
    unmount();
  });

  it('tells the store ambient still sounds when another tab is playing it', async () => {
    const release = anotherTabHolds();
    void navigator.locks.request(
      'cuewise-ambient-sounding',
      { mode: 'shared' },
      () => new Promise<void>(() => {})
    );
    const { unmount } = await renderLeader();

    release();

    await waitFor(() =>
      expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: false, ambientSounding: true })
    );
    unmount();
  });

  it('stays fresh through a StrictMode remount, which queues behind its own first mount', async () => {
    const { unmount } = await renderLeader({ strict: true });

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
    expect(setIsLeader).not.toHaveBeenCalledWith(true, expect.objectContaining({ fresh: false }));
    unmount();
  });

  it('drops its claim when leading throws, since the lock went with the throw', async () => {
    setIsLeader.mockImplementationOnce(() => {
      throw new Error('player failed');
    });

    const { unmount } = await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenLastCalledWith(false));
    unmount();
  });

  it('leads fresh without Web Locks', async () => {
    uninstallLocks();

    await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
  });
});
