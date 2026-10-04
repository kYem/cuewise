import { createSelectorMock } from '@cuewise/test-utils';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));

const setIsLeader = vi.fn();

function installLocks(query: () => Promise<LockManagerSnapshot>): void {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      query,
      request: (name: string, callback: (lock: { name: string }) => Promise<void>) =>
        callback({ name }),
    },
  });
}

function heldBy(names: string[]): () => Promise<LockManagerSnapshot> {
  return () => Promise.resolve({ held: names.map((name) => ({ name })), pending: [] });
}

/** A fresh module per test, since the probe is cached once per page. */
async function renderLeader() {
  vi.resetModules();
  const { useSoundsStore } = await import('../stores/sounds-store');
  vi.mocked(useSoundsStore).mockImplementation(createSelectorMock({ setIsLeader }));
  const { useSoundsLeader } = await import('./useSoundsLeader');
  return renderHook(() => useSoundsLeader());
}

describe('useSoundsLeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('leads fresh when no other tab held the audio', async () => {
    installLocks(heldBy([]));

    const { unmount } = await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
    unmount();
  });

  it('takes over, not fresh, when another tab was holding the audio', async () => {
    installLocks(heldBy(['cuewise-sounds-leader']));

    const { unmount } = await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: false }));
    unmount();
  });

  it('treats a failed probe as a takeover, so playback is kept rather than discarded', async () => {
    installLocks(() => Promise.reject(new Error('not fully active')));

    const { unmount } = await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: false }));
    unmount();
  });

  it('keeps the first answer across a remount, which would otherwise see its own lock', async () => {
    const query = vi
      .fn<() => Promise<LockManagerSnapshot>>()
      .mockImplementationOnce(heldBy([]))
      .mockImplementation(heldBy(['cuewise-sounds-leader']));
    installLocks(query);
    const first = await renderLeader();
    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
    first.unmount();
    setIsLeader.mockClear();

    const { useSoundsLeader } = await import('./useSoundsLeader');
    const second = renderHook(() => useSoundsLeader());

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
    expect(query).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('leads fresh without Web Locks', async () => {
    Reflect.deleteProperty(navigator, 'locks');

    await renderLeader();

    await waitFor(() => expect(setIsLeader).toHaveBeenCalledWith(true, { fresh: true }));
  });
});
