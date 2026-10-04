import { installLockManagerMock } from '@cuewise/test-utils';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistedAmbientPlayback } from '../stores/__fixtures__/sounds-store.fixtures';
import { useSoundsStore } from '../stores/sounds-store';
import { AMBIENT_LIVENESS_INTERVAL_MS, useAmbientLiveness } from './useAmbientLiveness';

/** Another tab sounding ambient; stops when the returned function is called. */
function anotherTabSounds(): () => void {
  let release: () => void = () => {};
  void navigator.locks.request(
    'cuewise-ambient-sounding',
    { mode: 'shared' },
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  return () => release();
}

describe('useAmbientLiveness', () => {
  let uninstallLocks: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    uninstallLocks = installLockManagerMock();
    persistedAmbientPlayback();
    useSoundsStore.setState({ isLeader: true });
  });

  afterEach(() => {
    uninstallLocks();
    useSoundsStore.setState(useSoundsStore.getInitialState());
    vi.useRealTimers();
  });

  it('shows ambient paused once the tab that played it has gone', async () => {
    const tabCloses = anotherTabSounds();
    renderHook(() => useAmbientLiveness());
    await vi.advanceTimersByTimeAsync(0);

    tabCloses();
    await vi.advanceTimersByTimeAsync(AMBIENT_LIVENESS_INTERVAL_MS);

    expect(useSoundsStore.getState()).toMatchObject({ isPlaying: false, isPaused: true });
  });

  it('leaves ambient playing while another tab still sounds it', async () => {
    anotherTabSounds();
    renderHook(() => useAmbientLiveness());

    await vi.advanceTimersByTimeAsync(AMBIENT_LIVENESS_INTERVAL_MS * 2);

    expect(useSoundsStore.getState()).toMatchObject({ isPlaying: true, isPaused: false });
  });

  it('leaves the check to the leader', async () => {
    useSoundsStore.setState({ isLeader: false });
    renderHook(() => useAmbientLiveness());

    await vi.advanceTimersByTimeAsync(AMBIENT_LIVENESS_INTERVAL_MS);

    expect(useSoundsStore.getState().isPlaying).toBe(true);
  });
});
