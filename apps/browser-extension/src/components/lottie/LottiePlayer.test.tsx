import { render } from '@testing-library/react';
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

describe('LottiePlayer', () => {
  beforeEach(() => {
    vi.mocked(lottie.loadAnimation).mockReset();
  });

  it('loads the animation with the provided data', () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    render(<LottiePlayer animationData={sampleData} />);

    expect(lottie.loadAnimation).toHaveBeenCalledTimes(1);
    const config = vi.mocked(lottie.loadAnimation).mock.calls[0][0] as AnimationConfigWithData;
    expect(config.animationData).toBe(sampleData);
    expect(config.loop).toBe(false);
    expect(config.autoplay).toBe(true);
    expect(config.renderer).toBe('svg');
  });

  it('calls onComplete when the animation completes', () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);
    const onComplete = vi.fn();

    render(<LottiePlayer animationData={sampleData} onComplete={onComplete} />);
    fake.fireComplete();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('destroys the animation on unmount', () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    const { unmount } = render(<LottiePlayer animationData={sampleData} />);
    unmount();

    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });

  it('passes loop=true to loadAnimation when loop is set', () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    render(<LottiePlayer animationData={sampleData} loop />);

    const config = vi.mocked(lottie.loadAnimation).mock.calls[0][0] as AnimationConfigWithData;
    expect(config.loop).toBe(true);
  });

  it('passes autoplay=false to loadAnimation when autoplay is disabled', () => {
    const fake = createFakeAnimation();
    vi.mocked(lottie.loadAnimation).mockReturnValue(fake.item);

    render(<LottiePlayer animationData={sampleData} autoplay={false} />);

    const config = vi.mocked(lottie.loadAnimation).mock.calls[0][0] as AnimationConfigWithData;
    expect(config.autoplay).toBe(false);
    expect(fake.goToAndStop).toHaveBeenCalledWith(0, true);
  });
});
