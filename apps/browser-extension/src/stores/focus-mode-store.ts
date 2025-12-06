import { logger } from '@cuewise/shared';
import { create } from 'zustand';
import { getUnsplashUrl, loadImageWithFallback, preloadImage } from '../utils/unsplash';
import { useSettingsStore } from './settings-store';

interface FocusModeStore {
  // State
  isActive: boolean;
  currentImageUrl: string | null;
  nextImageUrl: string | null;
  isImageLoading: boolean;
  imageError: string | null;

  // Actions
  enterFocusMode: () => Promise<void>;
  exitFocusMode: () => void;
  loadNextImage: () => Promise<void>;
  preloadNextImage: () => Promise<void>;
}

export const useFocusModeStore = create<FocusModeStore>((set, get) => ({
  // Initial state
  isActive: false,
  currentImageUrl: null,
  nextImageUrl: null,
  isImageLoading: false,
  imageError: null,

  enterFocusMode: async () => {
    const { isActive, nextImageUrl } = get();
    if (isActive) {
      return;
    }

    set({ isActive: true, isImageLoading: true, imageError: null });

    // Get the user's preferred category from settings
    const { settings } = useSettingsStore.getState();
    const category = settings.focusModeImageCategory;

    try {
      // If we have a preloaded image, use it
      if (nextImageUrl) {
        set({
          currentImageUrl: nextImageUrl,
          nextImageUrl: null,
          isImageLoading: false,
        });
        // Start preloading the next one
        get().preloadNextImage();
        return;
      }

      // Otherwise load a new image
      const url = getUnsplashUrl(category);
      const loadedUrl = await loadImageWithFallback(category, url);

      set({
        currentImageUrl: loadedUrl,
        isImageLoading: false,
      });

      // Start preloading the next image
      get().preloadNextImage();
    } catch (error) {
      logger.error('Failed to load focus mode image', error);
      set({
        isImageLoading: false,
        imageError: 'Failed to load background image',
        // Keep focus mode active even without image (will show fallback color)
      });
    }
  },

  exitFocusMode: () => {
    set({
      isActive: false,
      // Keep the loaded images cached for quick re-entry
    });
  },

  loadNextImage: async () => {
    const { isActive, nextImageUrl } = get();
    if (!isActive) {
      return;
    }

    set({ isImageLoading: true, imageError: null });

    const { settings } = useSettingsStore.getState();
    const category = settings.focusModeImageCategory;

    try {
      // If we have a preloaded image, use it
      if (nextImageUrl) {
        set({
          currentImageUrl: nextImageUrl,
          nextImageUrl: null,
          isImageLoading: false,
        });
        // Start preloading the next one
        get().preloadNextImage();
        return;
      }

      // Otherwise load a new image
      const url = getUnsplashUrl(category);
      const loadedUrl = await loadImageWithFallback(category, url);

      set({
        currentImageUrl: loadedUrl,
        isImageLoading: false,
      });

      // Start preloading the next image
      get().preloadNextImage();
    } catch (error) {
      logger.error('Failed to load next focus mode image', error);
      set({
        isImageLoading: false,
        imageError: 'Failed to load background image',
      });
    }
  },

  preloadNextImage: async () => {
    const { settings } = useSettingsStore.getState();
    const category = settings.focusModeImageCategory;

    try {
      const url = getUnsplashUrl(category);
      const loadedUrl = await preloadImage(url);
      set({ nextImageUrl: loadedUrl });
    } catch (error) {
      // Preload failure is not critical, log and continue
      logger.debug('Failed to preload next focus mode image', { error });
    }
  },
}));

/**
 * Clear cached images when focus mode settings change.
 * This ensures the new category takes effect immediately.
 */
export function clearFocusModeImageCache() {
  useFocusModeStore.setState({
    currentImageUrl: null,
    nextImageUrl: null,
  });
}
