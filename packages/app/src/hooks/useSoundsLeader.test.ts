import { createSelectorMock, installLockManagerMock } from '@cuewise/test-utils';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));

const LOCK_NAME = 'cuewise-sounds-leader';
const setIsLeader = vi.fn();
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
    vi.clearAllMocks();
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

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: false }));
    unmount();
  });

  it('stays fresh through a StrictMode remount, which queues behind its own first mount', async () => {
    const { unmount } = await renderLeader({ strict: true });

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
    expect(setIsLeader).not.toHaveBeenCalledWith(true, { fresh: false });
    unmount();
  });

  it('leads fresh without Web Locks', async () => {
    uninstallLocks();

    await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
  });
});
