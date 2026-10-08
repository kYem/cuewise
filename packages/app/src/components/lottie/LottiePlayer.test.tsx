import { logger } from '@cuewise/shared';
import { render, waitFor } from '@testing-library/react';
import type { AnimationConfigWithData, AnimationItem } from 'lottie-web';
import lottie from 'lottie-web/build/player/lottie_light';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LottiePlayer } from './LottiePlayer';

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: { loadAnimation: vi.fn() },
}));

interface FakeAnimation {
  item: AnimationItem;
  destroy: ReturnType<typeof vi.fn>;
  goToAndStop: ReturnType<typeof vi.fn>;
  fireComplete: () => void;
}

function createFakeAnimation(): FakeAnimation {
  let completeHandler: (() => void) | null = null;
  const destroy = vi.fn();
  const goToAndStop = vi.fn();
  const addEventListener = vi.fn((name: string, cb: () => void) => {
    if (name === 'complete') {
      completeHandler = cb;
    }
  });
  const item = { addEventListener, destroy, goToAndStop } as unknown as AnimationItem;
  const fireComplete = () => {
    if (completeHandler !== null) {
      completeHandler();
    }
  };
  return { item, destroy, goToAndStop, fireComplete };
}

const sampleData = { v: '5.7.4', fr: 30, ip: 0, op: 30, w: 10, h: 10, layers: [] };

async function loadedConfig(): Promise<AnimationConfigWithData> {
  await waitFor(() => expect(lottie.loadAnimation).toHaveBeenCalledTimes(1));
  return vi.mocked(lottie.loadAnimation).mock.calls[0][0] as AnimationConfigWithData;
}

describe('LottiePlayer', () => {
  beforeEach(() => {
    vi.mocked(lottie.loadAnimation).mockReset();
  });

  it('loads the animation with the provided data', async () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    render(<LottiePlayer animationData={sampleData} />);

    const config = await loadedConfig();
    expect(config.animationData).toBe(sampleData);
    expect(config.loop).toBe(false);
    expect(config.autoplay).toBe(true);
    expect(config.renderer).toBe('svg');
  });

  it('calls onComplete when the animation completes', async () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);
    const onComplete = vi.fn();

    render(<LottiePlayer animationData={sampleData} onComplete={onComplete} />);
    await loadedConfig();
    fake.fireComplete();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete when the player fails to load, so callers waiting on it are not stuck', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(lottie.loadAnimation).mockImplementation(() => {
      throw new Error('chunk failed');
    });
    const onComplete = vi.fn();

    render(<LottiePlayer animationData={sampleData} onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    vi.mocked(logger.error).mockRestore();
  });

  it('destroys the animation on unmount', async () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    const { unmount } = render(<LottiePlayer animationData={sampleData} />);
    await loadedConfig();
    unmount();

    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it('never starts an animation for a player unmounted before the module loads', async () => {
    const { unmount } = render(<LottiePlayer animationData={sampleData} />);
    unmount();

    await import('lottie-web/build/player/lottie_light');
    await Promise.resolve();

    expect(lottie.loadAnimation).not.toHaveBeenCalled();
  });

  it('passes loop=true to loadAnimation when loop is set', async () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    render(<LottiePlayer animationData={sampleData} loop />);

    const config = await loadedConfig();
    expect(config.loop).toBe(true);
  });

  it('passes autoplay=false to loadAnimation when autoplay is disabled', async () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    render(<LottiePlayer animationData={sampleData} autoplay={false} />);

    const config = await loadedConfig();
    expect(config.autoplay).toBe(false);
    expect(fake.goToAndStop).toHaveBeenCalledWith(0, true);
  });
});
