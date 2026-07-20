import { logger, type StorageResult } from '@cuewise/shared';
import { clearCustomBackground, getCustomBackground, setCustomBackground } from '@cuewise/storage';
import { create } from 'zustand';
import { setCustomBackgroundOverride } from '../utils/image-preload-cache';

interface BackgroundState {
  /** The user's own background as a data URL; null means use the curated rotation. */
  customBackground: string | null;
  /** False until storage has been read, so the page doesn't flash the wrong background. */
  isLoaded: boolean;
  loadCustomBackground: () => Promise<void>;
  saveCustomBackground: (dataUrl: string) => Promise<StorageResult>;
  removeCustomBackground: () => Promise<StorageResult>;
}

/** Owns the custom background end to end, so no caller can leave memory and storage disagreeing. */
export const useBackgroundStore = create<BackgroundState>((set) => ({
  customBackground: null,
  isLoaded: false,

  loadCustomBackground: async () => {
    try {
      const stored = await getCustomBackground();
      setCustomBackgroundOverride(stored);
      set({ customBackground: stored, isLoaded: true });
    } catch (error) {
      // Always land isLoaded — the page gates rendering on it and would stay blank forever.
      logger.error('Could not load the custom background; using the curated rotation', error);
      setCustomBackgroundOverride(null);
      set({ customBackground: null, isLoaded: true });
    }
  },

  saveCustomBackground: async (dataUrl) => {
    const result = await setCustomBackground(dataUrl);
    if (result.success) {
      setCustomBackgroundOverride(dataUrl);
      set({ customBackground: dataUrl });
    }
    return result;
  },

  removeCustomBackground: async () => {
    const result = await clearCustomBackground();
    if (result.success) {
      setCustomBackgroundOverride(null);
      set({ customBackground: null });
    }
    return result;
  },
}));
