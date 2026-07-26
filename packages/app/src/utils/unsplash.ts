import type { FocusImageCategory } from '@cuewise/shared';
import { CURATED_PHOTOS } from './unsplash-catalog';

/**
 * Unsplash image utility for focus mode backgrounds.
 * Uses curated images from images.unsplash.com (direct CDN).
 * Note: source.unsplash.com was deprecated in 2024.
 */

// Track last used index per category to avoid immediate repeats
const lastUsedIndex: Record<FocusImageCategory, number> = {
  nature: -1,
  forest: -1,
  ocean: -1,
  mountains: -1,
  minimal: -1,
  dark: -1,
};

// Unsplash asks attribution links to carry these referral params.
const REFERRAL_PARAMS = 'utm_source=cuewise&utm_medium=referral';
const UNSPLASH_URL = `https://unsplash.com?${REFERRAL_PARAMS}`;

export interface PhotoCreditEntry {
  photographer: string;
  username: string;
  location: string | null;
}

export interface PhotoCredit {
  /** Null when we don't know who shot it — never guess, an invented name is worse than none. */
  photographer: string | null;
  photographerUrl: string | null;
  /** The place the photo was taken; null when its Unsplash page carries no location tag. */
  location: string | null;
  sourceUrl: string;
}

// Derived from the catalog, so a credit can never point at a photo we don't ship.
const CREDIT_INDEX: Record<string, PhotoCreditEntry> = {};
for (const photos of Object.values(CURATED_PHOTOS)) {
  for (const photo of photos) {
    if (photo.photographer !== null && photo.username !== null) {
      CREDIT_INDEX[photo.id] = {
        photographer: photo.photographer,
        username: photo.username,
        location: photo.location,
      };
    }
  }
}

/** Whether this image came from Unsplash — false for a user's own picture, which we must not credit. */
export function isUnsplashUrl(url: string): boolean {
  return url.startsWith('https://images.unsplash.com/');
}

/** Extracts the `photo-…` CDN id from an Unsplash image URL; null if it isn't one. */
function extractPhotoId(url: string): string | null {
  return /\/(photo-[^/?]+)/.exec(url)?.[1] ?? null;
}

/**
 * Attribution for a background image. Always credits Unsplash; names the photographer
 * only when the catalog actually knows them.
 * @param credits - Override registry, for tests.
 */
export function getPhotoCredit(
  url: string,
  credits: Record<string, PhotoCreditEntry> = CREDIT_INDEX
): PhotoCredit {
  const photoId = extractPhotoId(url);
  const entry = photoId === null ? undefined : credits[photoId];
  if (entry === undefined) {
    return { photographer: null, photographerUrl: null, location: null, sourceUrl: UNSPLASH_URL };
  }
  return {
    photographer: entry.photographer,
    photographerUrl: `https://unsplash.com/@${entry.username}?${REFERRAL_PARAMS}`,
    location: entry.location,
    sourceUrl: UNSPLASH_URL,
  };
}

/**
 * Get a random image URL for the given category.
 * Uses curated fallback images from images.unsplash.com (direct CDN).
 * Note: source.unsplash.com was deprecated in 2024.
 * @param category - The image category
 * @returns Direct Unsplash CDN image URL
 */
export function getUnsplashUrl(category: FocusImageCategory): string {
  // source.unsplash.com is deprecated (2024), use curated images directly
  return getRandomImageUrl(category);
}

/**
 * Get a random image URL from our curated collection.
 * Uses random selection but avoids immediate repeats.
 * @param category - The image category
 * @param index - Optional index for specific image (default: random)
 * @returns Direct Unsplash CDN image URL with cache-busting
 */
export function getRandomImageUrl(category: FocusImageCategory, index?: number): string {
  const images = CURATED_PHOTOS[category];
  let selectedIndex: number;

  if (index !== undefined) {
    selectedIndex = index % images.length;
  } else {
    // Random selection that avoids immediate repeats
    const lastIndex = lastUsedIndex[category];
    const availableIndices = images
      .map((_, i) => i)
      .filter((i) => i !== lastIndex || images.length === 1);
    selectedIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    lastUsedIndex[category] = selectedIndex;
  }

  const imageId = images[selectedIndex].id;
  // Add timestamp for cache-busting to ensure fresh requests
  const timestamp = Date.now();
  return `https://images.unsplash.com/${imageId}?w=1920&h=1080&fit=crop&auto=format&t=${timestamp}`;
}

/**
 * Preload an image and return a promise that resolves when loaded.
 * @param url - The image URL to preload
 * @param timeout - Timeout in milliseconds (default 10000)
 * @returns Promise that resolves with the URL when loaded, or rejects on error/timeout
 */
export function preloadImage(url: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      img.src = ''; // Cancel loading
      reject(new Error('Image load timeout'));
    }, timeout);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(url);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Load an image from our curated collection with retry support.
 * Tries multiple images if one fails to load.
 * @param category - The image category
 * @returns Promise that resolves with a working image URL
 */
export async function loadImageWithFallback(category: FocusImageCategory): Promise<string> {
  const images = CURATED_PHOTOS[category];

  // Try up to 3 different images if loading fails
  for (let attempt = 0; attempt < Math.min(3, images.length); attempt++) {
    try {
      const imageUrl = getRandomImageUrl(category);
      return await preloadImage(imageUrl, 8000);
    } catch {
      // Continue to next image
    }
  }
  // All attempts failed - component should show solid color
  throw new Error('All image sources failed');
}
