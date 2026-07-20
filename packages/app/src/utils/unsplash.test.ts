import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPhotoCredit, loadImageWithFallback, preloadImage } from './unsplash';

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

describe('getPhotoCredit', () => {
  it('credits Unsplash as the source for a curated image', () => {
    const credit = getPhotoCredit(
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920'
    );
    expect(credit.sourceUrl).toContain('https://unsplash.com');
  });

  it('carries the referral params Unsplash asks attribution links to use', () => {
    const credit = getPhotoCredit(
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920'
    );
    expect(credit.sourceUrl).toContain('utm_source=cuewise');
    expect(credit.sourceUrl).toContain('utm_medium=referral');
  });

  it('reports an unknown photographer rather than inventing one', () => {
    const credit = getPhotoCredit(
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920'
    );
    expect(credit.photographer).toBeNull();
    expect(credit.photographerUrl).toBeNull();
  });

  it('names the photographer once the credit is known', () => {
    const credit = getPhotoCredit(
      'https://images.unsplash.com/photo-test-credited?w=1920',
      // Injected registry keeps the test independent of which real photos we've researched.
      { 'photo-test-credited': { photographer: 'Ansel Adams', username: 'ansel' } }
    );
    expect(credit.photographer).toBe('Ansel Adams');
    expect(credit.photographerUrl).toBe(
      'https://unsplash.com/@ansel?utm_source=cuewise&utm_medium=referral'
    );
  });

  it('still credits Unsplash for a url it cannot parse a photo id from', () => {
    const credit = getPhotoCredit('https://example.com/not-unsplash.jpg');
    expect(credit.photographer).toBeNull();
    expect(credit.sourceUrl).toContain('https://unsplash.com');
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
