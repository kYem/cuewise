import { installLockManagerMock } from '@cuewise/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmbientSoundPlayer, isAmbientSoundingAnywhere } from './ambient-sounds';

/** Only what play/stop touch before the sound generators, which are stubbed out below. */
class StubAudioContext {
  currentTime = 0;
  destination = {};
  createGain() {
    return { gain: { value: 0, linearRampToValueAtTime: () => {} }, connect: () => {} };
  }
}

function silentPlayer(): AmbientSoundPlayer {
  const player = new AmbientSoundPlayer();
  vi.spyOn(
    player as unknown as { createRainSound: () => void },
    'createRainSound'
  ).mockImplementation(() => {});
  return player;
}

describe('isAmbientSoundingAnywhere', () => {
  let uninstallLocks: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', StubAudioContext);
    uninstallLocks = installLockManagerMock();
  });

  afterEach(() => {
    uninstallLocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('answers no while no tab is sounding ambient', async () => {
    await expect(isAmbientSoundingAnywhere()).resolves.toBe(false);
  });

  it('answers yes while a player is sounding', async () => {
    const player = silentPlayer();

    player.play('rain');
    await vi.advanceTimersByTimeAsync(0);

    await expect(isAmbientSoundingAnywhere()).resolves.toBe(true);
  });

  it('answers no again once that player has stopped', async () => {
    const player = silentPlayer();
    player.play('rain');
    await vi.advanceTimersByTimeAsync(0);

    player.stop();
    await vi.advanceTimersByTimeAsync(500);

    await expect(isAmbientSoundingAnywhere()).resolves.toBe(false);
  });

  it('answers yes when it cannot ask, since pausing live ambient would silence it everywhere', async () => {
    vi.spyOn(navigator.locks, 'request').mockRejectedValue(new Error('not fully active'));

    await expect(isAmbientSoundingAnywhere()).resolves.toBe(true);
  });

  it('falls back to this tab alone without Web Locks', async () => {
    uninstallLocks();

    await expect(isAmbientSoundingAnywhere()).resolves.toBe(false);
  });
});
