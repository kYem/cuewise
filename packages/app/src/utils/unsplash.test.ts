import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPhotoCredit,
  getRandomImageUrl,
  ImageLoadTimeoutError,
  loadImageWithFallback,
  preloadImage,
} from './unsplash';
import { CURATED_PHOTOS } from './unsplash-catalog';

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

describe('getRandomImageUrl', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the same photo the same URL a second later, so the CDN edge can serve it', () => {
    vi.useFakeTimers();
    const first = getRandomImageUrl('nature', 0);
    vi.advanceTimersByTime(1000);

    expect(getRandomImageUrl('nature', 0)).toBe(first);
  });
});

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

  it('rejects a stalled image with an error callers can tell apart from a dead one', async () => {
    vi.useFakeTimers();
    const promise = preloadImage('https://img/hang.jpg', 5000);
    const expectation = expect(promise).rejects.toBeInstanceOf(ImageLoadTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });

  it('leaves the request running after a timeout, so a slow image still reaches the cache', async () => {
    vi.useFakeTimers();
    const promise = preloadImage('https://img/slow.jpg', 5000);
    const expectation = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;

    expect(lastImage().src).toBe('https://img/slow.jpg');
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
      'https://images.unsplash.com/photo-1000000000000-000000000000?w=1920'
    );
    expect(credit.photographer).toBeNull();
    expect(credit.photographerUrl).toBeNull();
  });

  it('credits every shipped photo, so the anonymous fallback never shows for the catalog', () => {
    for (const photo of Object.values(CURATED_PHOTOS).flat()) {
      const credit = getPhotoCredit(`https://images.unsplash.com/${photo.id}?w=1920`);
      expect(credit.photographer).not.toBeNull();
    }
  });

  it('names the photographer once the credit is known', () => {
    const credit = getPhotoCredit(
      'https://images.unsplash.com/photo-test-credited?w=1920',
      // Injected registry keeps the test independent of which real photos we've researched.
      { 'photo-test-credited': { photographer: 'Ansel Adams', username: 'ansel', location: null } }
    );
    expect(credit.photographer).toBe('Ansel Adams');
    expect(credit.photographerUrl).toBe(
      'https://unsplash.com/@ansel?utm_source=cuewise&utm_medium=referral'
    );
  });

  it('carries the location when the catalog knows it', () => {
    const credit = getPhotoCredit('https://images.unsplash.com/photo-test-located?w=1920', {
      'photo-test-located': {
        photographer: 'Ansel Adams',
        username: 'ansel',
        location: 'Yosemite, United States',
      },
    });
    expect(credit.location).toBe('Yosemite, United States');
  });

  it('returns a null location for an unknown photo', () => {
    const credit = getPhotoCredit(
      'https://images.unsplash.com/photo-1000000000000-000000000000?w=1920'
    );
    expect(credit.location).toBeNull();
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
    vi.useRealTimers();
  });

  it('waits on a slow pick rather than handing it back unseen or starting a rival', async () => {
    vi.useFakeTimers();
    let settled = false;
    const promise = loadImageWithFallback('nature');
    promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(20_000);

    expect(settled).toBe(false);
    expect(MockImage.instances).toHaveLength(1);
    lastImage().onload?.();
    await expect(promise).resolves.toBe(lastImage().src);
  });

  it('gives up on a pick that outlasts its budget, without a rival beside it', async () => {
    vi.useFakeTimers();
    const promise = loadImageWithFallback('nature');
    const expectation = expect(promise).rejects.toThrow('All image sources failed');
    await vi.advanceTimersByTimeAsync(30_000);
    await expectation;

    expect(MockImage.instances).toHaveLength(1);
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

describe('curated catalog invariants', () => {
  const allIds = Object.values(CURATED_PHOTOS)
    .flat()
    .map((photo) => photo.id);

  it('has no duplicate ids across categories', () => {
    const seen = new Set(allIds);
    expect(seen.size).toBe(allIds.length);
  });

  it('uses well-formed CDN ids only', () => {
    for (const id of allIds) {
      expect(id).toMatch(/^photo-\d+-[0-9a-f]+$/);
    }
  });

  it('sets photographer and username together or not at all', () => {
    for (const photo of Object.values(CURATED_PHOTOS).flat()) {
      expect(photo.photographer === null).toBe(photo.username === null);
    }
  });

  it('offers at least 15 images per category', () => {
    for (const photos of Object.values(CURATED_PHOTOS)) {
      expect(photos.length).toBeGreaterThanOrEqual(15);
    }
  });
});
