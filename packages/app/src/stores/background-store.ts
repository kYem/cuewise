import { logger, type StorageResult } from '@cuewise/shared';
import { clearCustomBackground, getCustomBackground, setCustomBackground } from '@cuewise/storage';
import { create } from 'zustand';
import { setCustomBackgroundOverride } from '../utils/image-preload-cache';

const LOAD_TIMEOUT_MS = 3000;

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
      // Bounded: pages hide their content until isLoaded, so a read that never settles
      // (invalidated extension context) would leave the app permanently blank.
      const stored = await Promise.race([
        getCustomBackground(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
      ]);
      setCustomBackgroundOverride(stored);
      set({ customBackground: stored, isLoaded: true });
    } catch (error) {
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
