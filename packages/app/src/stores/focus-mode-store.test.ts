import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('../utils/image-preload-cache', () => ({
  getCustomBackgroundOverride: vi.fn(),
  getPreloadedCurrentUrl: vi.fn(),
  preloadImages: vi.fn(),
}));
vi.mock('../utils/unsplash', () => ({ loadImageWithFallback: vi.fn() }));

import {
  getCustomBackgroundOverride,
  getPreloadedCurrentUrl,
  preloadImages,
} from '../utils/image-preload-cache';
import { loadImageWithFallback } from '../utils/unsplash';
import { useFocusModeStore } from './focus-mode-store';

const mockOverride = getCustomBackgroundOverride as unknown as Mock;
const mockPreloaded = getPreloadedCurrentUrl as unknown as Mock;
const mockLoadFallback = loadImageWithFallback as unknown as Mock;
const mockPreloadImages = preloadImages as unknown as Mock;

const MINE = 'data:image/jpeg;base64,mine';
const CURATED = 'https://images.unsplash.com/photo-curated';

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
    mockLoadFallback.mockResolvedValue(CURATED);
    mockPreloadImages.mockReset().mockResolvedValue(undefined);
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

  it('adopts the image that arrived while focus mode was opening', async () => {
    // Auto-enter races the storage read: the override lands mid-resolve, and without the
    // post-resolve re-check the curated photo sticks for the whole session.
    useFocusModeStore.setState({ isActive: false, currentImageUrl: null, nextImageUrl: null });
    mockPreloaded.mockReturnValueOnce(null).mockReturnValue(CURATED);
    mockOverride.mockReturnValue(null);
    mockPreloadImages.mockImplementation(() => {
      mockOverride.mockReturnValue(MINE);
      return Promise.resolve();
    });

    await useFocusModeStore.getState().enterFocusMode();

    expect(useFocusModeStore.getState().currentImageUrl).toBe(MINE);
  });

  it('shows the curated photo when no custom image arrives', async () => {
    useFocusModeStore.setState({ isActive: false, currentImageUrl: null, nextImageUrl: null });
    mockPreloaded.mockReturnValueOnce(null).mockReturnValue(CURATED);
    mockOverride.mockReturnValue(null);

    await useFocusModeStore.getState().enterFocusMode();

    expect(useFocusModeStore.getState().currentImageUrl).toBe(CURATED);
  });
});

describe('focus mode background resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFocusModeStore.setState({
      isActive: false,
      currentImageUrl: null,
      nextImageUrl: null,
      isImageLoading: false,
      imageError: null,
    });
    mockPreloadImages.mockResolvedValue(undefined);
  });

  // A raw fetch never persists, so entering twice would show two different photos.
  // (loadImageWithFallback is still called afterwards, to queue the next rotation image.)
  it("resolves today's photo through the shared cache instead of fetching a fresh one", async () => {
    mockPreloaded.mockReturnValueOnce(null).mockReturnValue(CURATED);
    mockOverride.mockReturnValue(null);

    await useFocusModeStore.getState().enterFocusMode();

    expect(mockPreloadImages).toHaveBeenCalledWith('nature');
    expect(useFocusModeStore.getState().currentImageUrl).toBe(CURATED);
  });

  it('reports an error when no photo can be resolved at all', async () => {
    mockPreloaded.mockReturnValue(null);
    mockOverride.mockReturnValue(null);

    await useFocusModeStore.getState().enterFocusMode();

    expect(useFocusModeStore.getState().imageError).toBe('Failed to load background image');
    expect(useFocusModeStore.getState().isImageLoading).toBe(false);
  });
});
