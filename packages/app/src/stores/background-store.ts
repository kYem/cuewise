import { getCustomBackground } from '@cuewise/storage';
import { create } from 'zustand';

interface BackgroundState {
  /** The user's own background as a data URL; null means use the curated rotation. */
  customBackground: string | null;
  /** False until storage has been read, so the page doesn't flash the wrong background. */
  isLoaded: boolean;
  loadCustomBackground: () => Promise<void>;
  setCustomBackground: (dataUrl: string | null) => void;
}

/**
 * Holds the custom background so the settings picker and the page that renders it
 * stay in step. Writes happen in the picker, which needs the storage result to report
 * a quota failure; this store carries the outcome to the rest of the app.
 */
export const useBackgroundStore = create<BackgroundState>((set) => ({
  customBackground: null,
  isLoaded: false,

  loadCustomBackground: async () => {
    const stored = await getCustomBackground();
    set({ customBackground: stored, isLoaded: true });
  },

  setCustomBackground: (dataUrl) => set({ customBackground: dataUrl }),
}));
