import type { FocusImageCategory } from '@cuewise/shared';
import { logger } from '@cuewise/shared';
import { getDailyBackground, setDailyBackground } from '@cuewise/storage';
import { loadImageWithFallback, preloadImage } from './unsplash';

/**
 * Daily background cache.
 *
 * The background image changes once per day and is persisted to Chrome storage,
 * then restored on app load. The URL is verified to load before it's cached or
 * persisted, so an image that no longer loads (404) is never stored — it's
 * replaced with a working one instead.
 */

interface PreloadCache {
  currentUrl: string | null;
  category: FocusImageCategory | null;
  isInitialized: boolean;
}

// The user's own image, when set. Held here because every surface that shows a background
// (new tab, focus mode, Pomodoro) already reads through getPreloadedCurrentUrl.
let customOverride: string | null = null;

/** Set by the background store; null restores the curated rotation. */
export function setCustomBackgroundOverride(dataUrl: string | null): void {
  customOverride = dataUrl;
}

const cache: PreloadCache = {
  currentUrl: null,
  category: null,
  isInitialized: false,
};

/**
 * Resolve today's daily background to a URL verified to load. A persisted
 * background is validated first — an image Unsplash has since removed must not
 * stick — and if it's missing or dead, a fresh validated image is picked and
 * persisted in its place. Returns null only if every source fails.
 */
async function resolveDailyBackground(category: FocusImageCategory): Promise<string | null> {
  const stored = await getDailyBackground(category);
  if (stored) {
    try {
      return await preloadImage(stored.url, 8000);
    } catch {
      // Stored image no longer loads (e.g. 404) — fall through and replace it.
    }
  }

  try {
    const url = await loadImageWithFallback(category);
    await setDailyBackground(url, category);
    return url;
  } catch (error) {
    logger.warn('No background image could be loaded; showing the solid fallback', { error });
    return null;
  }
}

/**
 * Resolve and cache today's daily background. Restored from storage across the
 * day; a fresh one is picked (and persisted) only when the stored image is
 * missing or no longer loads.
 */
export async function preloadImages(category: FocusImageCategory): Promise<void> {
  // The user's own image is showing — don't fetch a curated photo nobody will see.
  if (customOverride !== null) {
    return;
  }

  // Skip if already resolved for this category.
  if (cache.isInitialized && cache.category === category && cache.currentUrl) {
    return;
  }

  cache.category = category;
  cache.currentUrl = await resolveDailyBackground(category);
  cache.isInitialized = true;
}

/**
 * Pick a fresh background on demand, replacing today's. Unlike preloadImages this
 * skips the persisted image entirely — the point is to move past it. The current
 * background is left untouched if nothing new loads, so a refresh can't blank the page.
 * @returns The new URL, or null if no fresh image could be loaded.
 */
export async function refreshBackground(category: FocusImageCategory): Promise<string | null> {
  try {
    const url = await loadImageWithFallback(category);
    await setDailyBackground(url, category);
    cache.category = category;
    cache.currentUrl = url;
    cache.isInitialized = true;
    return url;
  } catch (error) {
    logger.warn('Could not load a new background; keeping the current one', { error });
    return null;
  }
}

/**
 * Get the background URL to show: the user's own image wins over the daily rotation.
 * Returns null if not resolved or the category doesn't match.
 */
export function getPreloadedCurrentUrl(category: FocusImageCategory): string | null {
  if (customOverride !== null) {
    return customOverride;
  }
  if (cache.category === category && cache.currentUrl) {
    return cache.currentUrl;
  }
  return null;
}

/**
 * Clear the cache (e.g., when the category changes).
 */
export function clearPreloadCache(): void {
  cache.currentUrl = null;
  cache.category = null;
  cache.isInitialized = false;
}
