import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('../utils/image-preload-cache', () => ({
  getCustomBackgroundOverride: vi.fn(),
  getPreloadedCurrentUrl: vi.fn(),
}));
vi.mock('../utils/unsplash', () => ({ loadImageWithFallback: vi.fn() }));

import { getCustomBackgroundOverride, getPreloadedCurrentUrl } from '../utils/image-preload-cache';
import { loadImageWithFallback } from '../utils/unsplash';
import { useFocusModeStore } from './focus-mode-store';

const mockOverride = getCustomBackgroundOverride as unknown as Mock;
const mockPreloaded = getPreloadedCurrentUrl as unknown as Mock;
const mockLoadFallback = loadImageWithFallback as unknown as Mock;

const MINE = 'data:image/jpeg;base64,mine';

describe('focus mode with a custom background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFocusModeStore.setState({
      isActive: true,
      currentImageUrl: MINE,
      nextImageUrl: null,
      isImageLoading: false,
      imageError: null,
    });
    mockLoadFallback.mockResolvedValue('https://images.unsplash.com/photo-curated');
  });

  it("keeps the user's own image when asked for the next one", async () => {
    mockOverride.mockReturnValue(MINE);

    await useFocusModeStore.getState().loadNextImage();

    expect(useFocusModeStore.getState().currentImageUrl).toBe(MINE);
    expect(mockLoadFallback).not.toHaveBeenCalled();
  });

  it('discards a curated image queued before the override was set', async () => {
    mockOverride.mockReturnValue(MINE);
    useFocusModeStore.setState({ nextImageUrl: 'https://images.unsplash.com/photo-stale' });

    await useFocusModeStore.getState().loadNextImage();

    expect(useFocusModeStore.getState().currentImageUrl).toBe(MINE);
    expect(useFocusModeStore.getState().nextImageUrl).toBeNull();
  });

  it('queues no curated image to rotate to', async () => {
    mockOverride.mockReturnValue(MINE);

    await useFocusModeStore.getState().preloadNextImage();

    expect(mockLoadFallback).not.toHaveBeenCalled();
    expect(useFocusModeStore.getState().nextImageUrl).toBeNull();
  });

  it('still rotates through curated photos when no custom image is set', async () => {
    mockOverride.mockReturnValue(null);
    mockPreloaded.mockReturnValue(null);

    await useFocusModeStore.getState().loadNextImage();

    expect(mockLoadFallback).toHaveBeenCalled();
    expect(useFocusModeStore.getState().currentImageUrl).toBe(
      'https://images.unsplash.com/photo-curated'
    );
  });
});
