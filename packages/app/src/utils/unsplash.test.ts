import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImageWithFallback, preloadImage } from './unsplash';

// Controllable Image stand-in: jsdom never fires load events, so tests trigger
// onload/onerror on the created instance themselves.
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  static instances: MockImage[] = [];
  constructor() {
    MockImage.instances.push(this);
  }
}

function lastImage(): MockImage {
  const img = MockImage.instances.at(-1);
  if (!img) {
    throw new Error('no Image was created');
  }
  return img;
}

describe('preloadImage', () => {
  beforeEach(() => {
    MockImage.instances = [];
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves with the url when the image loads', async () => {
    const promise = preloadImage('https://img/ok.jpg');
    lastImage().onload?.();
    await expect(promise).resolves.toBe('https://img/ok.jpg');
  });

  it('rejects when the image errors', async () => {
    const promise = preloadImage('https://img/bad.jpg');
    lastImage().onerror?.();
    await expect(promise).rejects.toThrow('Failed to load image');
  });

  it('rejects when the image neither loads nor errors before the timeout', async () => {
    vi.useFakeTimers();
    const promise = preloadImage('https://img/hang.jpg', 5000);
    const expectation = expect(promise).rejects.toThrow('Image load timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });
});

describe('loadImageWithFallback', () => {
  beforeEach(() => {
    MockImage.instances = [];
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws after every image attempt fails', async () => {
    const promise = loadImageWithFallback('nature');
    let settled = false;
    promise.catch(() => {
      settled = true;
    });

    // loadImageWithFallback tries up to 3 images sequentially; fail each as it's
    // created. Re-firing the same instance's onerror is a harmless no-op.
    for (let i = 0; i < 6 && !settled; i++) {
      await Promise.resolve();
      await Promise.resolve();
      MockImage.instances.at(-1)?.onerror?.();
    }

    await expect(promise).rejects.toThrow('All image sources failed');
  });
});
