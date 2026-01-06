import type { FocusImageCategory } from '@cuewise/shared';
import { getDailyBackground, setDailyBackground } from '@cuewise/storage';
import { getRandomImageUrl } from './unsplash';

/**
 * Image preload cache with daily background persistence.
 *
 * Background images change only once per day unless manually refreshed in focus mode.
 * The daily background is persisted to Chrome storage and restored on app load.
 */

interface PreloadCache {
  currentUrl: string | null;
  nextUrl: string | null;
  category: FocusImageCategory | null;
  isInitialized: boolean;
}

const cache: PreloadCache = {
  currentUrl: null,
  nextUrl: null,
  category: null,
  isInitialized: false,
};

/**
 * Initialize and preload images for the given category.
 * First checks for a persisted daily background, then preloads a "next" image for manual refresh.
 */
export async function preloadImages(category: FocusImageCategory): Promise<void> {
  // Skip if already initialized for this category
  if (cache.isInitialized && cache.category === category && cache.currentUrl && cache.nextUrl) {
    return;
  }

  cache.category = category;

  // Check for persisted daily background
  const dailyBackground = await getDailyBackground(category);

  if (dailyBackground) {
    // Use persisted daily background
    cache.currentUrl = dailyBackground.url;
    const img1 = new Image();
    img1.src = dailyBackground.url;
  } else {
    // No daily background for today - get a new one and persist it
    const currentUrl = getRandomImageUrl(category);
    cache.currentUrl = currentUrl;
    const img1 = new Image();
    img1.src = currentUrl;

    // Persist the new daily background
    await setDailyBackground(currentUrl, category);
  }

  // Always preload a "next" image for manual refresh in focus mode
  const nextUrl = getRandomImageUrl(category);
  cache.nextUrl = nextUrl;
  const img2 = new Image();
  img2.src = nextUrl;

  cache.isInitialized = true;
}

/**
 * Get the preloaded current image URL (daily background).
 * Returns null if not preloaded or category doesn't match.
 */
export function getPreloadedCurrentUrl(category: FocusImageCategory): string | null {
  if (cache.category === category && cache.currentUrl) {
    return cache.currentUrl;
  }
  return null;
}

/**
 * Get the preloaded next image URL and rotate it to current.
 * This is used for manual refresh in focus mode - bypasses daily persistence.
 * Preloads a new "next" image in the background.
 */
export async function getPreloadedNextUrl(category: FocusImageCategory): Promise<string | null> {
  if (cache.category !== category || !cache.nextUrl) {
    return null;
  }

  // Rotate: next becomes current
  const nextUrl = cache.nextUrl;
  cache.currentUrl = nextUrl;

  // Preload a new "next" image
  const newNextUrl = getRandomImageUrl(category);
  cache.nextUrl = newNextUrl;
  const img = new Image();
  img.src = newNextUrl;

  // Note: We don't persist this change to daily storage
  // Manual refreshes in focus mode are intentionally not persisted
  // so the daily background is restored on next app load

  return nextUrl;
}

/**
 * Clear the cache (e.g., when category changes).
 */
export function clearPreloadCache(): void {
  cache.currentUrl = null;
  cache.nextUrl = null;
  cache.category = null;
  cache.isInitialized = false;
}
