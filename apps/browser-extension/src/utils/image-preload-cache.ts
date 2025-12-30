import type { FocusImageCategory } from '@cuewise/shared';
import { getRandomImageUrl } from './unsplash';

/**
 * Simple cache for preloaded background images.
 * Stores URLs that have been preloaded so they can be reused.
 */

interface PreloadCache {
  currentUrl: string | null;
  nextUrl: string | null;
  category: FocusImageCategory | null;
}

const cache: PreloadCache = {
  currentUrl: null,
  nextUrl: null,
  category: null,
};

/**
 * Preload two images for the given category.
 * First image is "current", second is "next" (ready for refresh).
 */
export function preloadImages(category: FocusImageCategory): void {
  // Skip if already preloaded for this category
  if (cache.category === category && cache.currentUrl && cache.nextUrl) {
    return;
  }

  cache.category = category;

  // Get first image URL and preload
  const currentUrl = getRandomImageUrl(category);
  cache.currentUrl = currentUrl;
  const img1 = new Image();
  img1.src = currentUrl;

  // Get second image URL and preload
  const nextUrl = getRandomImageUrl(category);
  cache.nextUrl = nextUrl;
  const img2 = new Image();
  img2.src = nextUrl;
}

/**
 * Get the preloaded current image URL.
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
 * Preloads a new "next" image in the background.
 */
export function getPreloadedNextUrl(category: FocusImageCategory): string | null {
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

  return nextUrl;
}

/**
 * Clear the cache (e.g., when category changes).
 */
export function clearPreloadCache(): void {
  cache.currentUrl = null;
  cache.nextUrl = null;
  cache.category = null;
}
