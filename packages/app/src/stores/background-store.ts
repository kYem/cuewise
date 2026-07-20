import { logger, type StorageResult } from '@cuewise/shared';
import { clearCustomBackground, getCustomBackground, setCustomBackground } from '@cuewise/storage';
import { create } from 'zustand';
import { setCustomBackgroundOverride } from '../utils/image-preload-cache';

/** Pages hide their content until the read lands, so it can't be allowed to wait forever. */
const LOAD_TIMEOUT_MS = 3000;

// Bumped on every user write. A read that resolves afterwards is stale and must not undo it.
let writeGeneration = 0;

interface BackgroundState {
  /** The user's own background as a data URL; null means use the curated rotation. */
  customBackground: string | null;
  /** False until storage has been read, so the page doesn't flash the wrong background. */
  isLoaded: boolean;
  /** True when the read failed — distinct from "no image set", which looks identical. */
  loadFailed: boolean;
  loadCustomBackground: () => Promise<void>;
  saveCustomBackground: (dataUrl: string) => Promise<StorageResult>;
  removeCustomBackground: () => Promise<StorageResult>;
}

/** Every write goes through here, so memory mirrors storage rather than drifting per caller. */
export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  customBackground: null,
  isLoaded: false,
  loadFailed: false,

  loadCustomBackground: async () => {
    const generation = writeGeneration;
    // Release the page on time, but keep waiting: a slow read still applies when it lands,
    // rather than leaving the user on the curated rotation for the whole session.
    const timer = setTimeout(() => {
      if (!get().isLoaded) {
        logger.error('Timed out reading the custom background; using the curated rotation');
        set({ isLoaded: true, loadFailed: true });
      }
    }, LOAD_TIMEOUT_MS);

    try {
      const stored = await getCustomBackground();
      if (generation !== writeGeneration) {
        // The user saved or removed while we were reading; their action is the truth.
        return;
      }
      setCustomBackgroundOverride(stored);
      set({ customBackground: stored, isLoaded: true, loadFailed: false });
    } catch (error) {
      logger.error('Could not load the custom background; using the curated rotation', error);
      set({ isLoaded: true, loadFailed: true });
    } finally {
      clearTimeout(timer);
    }
  },

  saveCustomBackground: async (dataUrl) => {
    const result = await setCustomBackground(dataUrl);
    if (result.success) {
      writeGeneration += 1;
      setCustomBackgroundOverride(dataUrl);
      set({ customBackground: dataUrl, isLoaded: true, loadFailed: false });
    }
    return result;
  },

  removeCustomBackground: async () => {
    const result = await clearCustomBackground();
    if (result.success) {
      writeGeneration += 1;
      setCustomBackgroundOverride(null);
      set({ customBackground: null, isLoaded: true, loadFailed: false });
    }
    return result;
  },
}));
