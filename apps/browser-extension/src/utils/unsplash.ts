import type { FocusImageCategory } from '@cuewise/shared';

/**
 * Unsplash Source URL utility for focus mode backgrounds.
 * Uses source.unsplash.com which doesn't require an API key.
 */

// Category to Unsplash search query mapping
const CATEGORY_QUERIES: Record<FocusImageCategory, string> = {
  nature: 'nature,landscape,scenic',
  forest: 'forest,trees,woodland',
  ocean: 'ocean,sea,beach,calm',
  mountains: 'mountains,peaks,alpine',
  minimal: 'minimal,simple,abstract',
  dark: 'dark,night,moody',
};

// Known-good fallback image IDs from Unsplash (static, high-quality images)
// These are used when source.unsplash.com fails (503, rate limit, etc.)
const FALLBACK_IMAGE_IDS: Record<FocusImageCategory, string[]> = {
  nature: [
    'photo-1469474968028-56623f02e42e', // Mountain lake
    'photo-1426604966848-d7adac402bff', // Forest valley
    'photo-1470071459604-3b5ec3a7fe05', // Foggy mountains
  ],
  forest: [
    'photo-1448375240586-882707db888b', // Forest path
    'photo-1542273917363-3b1817f69a2d', // Green forest
    'photo-1511497584788-876760111969', // Misty forest
  ],
  ocean: [
    'photo-1505142468610-359e7d316be0', // Ocean waves
    'photo-1507525428034-b723cf961d3e', // Beach sunset
    'photo-1439405326854-014607f694d7', // Calm sea
  ],
  mountains: [
    'photo-1464822759023-fed622ff2c3b', // Mountain peak
    'photo-1506905925346-21bda4d32df4', // Snow mountains
    'photo-1454496522488-7a8e488e8606', // Mountain range
  ],
  minimal: [
    'photo-1557682250-33bd709cbe85', // Gradient
    'photo-1558591710-4b4a1ae0f04d', // Abstract
    'photo-1557683316-973673baf926', // Minimal waves
  ],
  dark: [
    'photo-1419242902214-272b3f66ee7a', // Night sky
    'photo-1507400492013-162706c8c05e', // Dark forest
    'photo-1472552944129-b035e9ea3744', // Night cityscape
  ],
};

// Track last used fallback index per category to avoid immediate repeats
const lastFallbackIndex: Record<FocusImageCategory, number> = {
  nature: -1,
  forest: -1,
  ocean: -1,
  mountains: -1,
  minimal: -1,
  dark: -1,
};

/**
 * Generate an Unsplash Source URL for a random image in the given category.
 * @param category - The image category
 * @param width - Image width (default 1920)
 * @param height - Image height (default 1080)
 * @returns Unsplash Source URL
 */
export function getUnsplashUrl(category: FocusImageCategory, width = 1920, height = 1080): string {
  const query = CATEGORY_QUERIES[category];
  // Add timestamp to get a different image each time (cache-busting)
  const timestamp = Date.now();
  return `https://source.unsplash.com/${width}x${height}/?${query}&sig=${timestamp}`;
}

/**
 * Get a random fallback image URL from our known-good list.
 * Uses random selection but avoids immediate repeats.
 * @param category - The image category
 * @param index - Optional index for specific fallback (default: random)
 * @returns Direct Unsplash image URL with cache-busting
 */
export function getFallbackImageUrl(category: FocusImageCategory, index?: number): string {
  const fallbacks = FALLBACK_IMAGE_IDS[category];
  let selectedIndex: number;

  if (index !== undefined) {
    selectedIndex = index % fallbacks.length;
  } else {
    // Random selection that avoids immediate repeats
    const lastIndex = lastFallbackIndex[category];
    const availableIndices = fallbacks
      .map((_, i) => i)
      .filter((i) => i !== lastIndex || fallbacks.length === 1);
    selectedIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    lastFallbackIndex[category] = selectedIndex;
  }

  const imageId = fallbacks[selectedIndex];
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
 * Try to load an image with fallback support.
 * First tries the primary URL, then falls back to known-good images.
 * Fallbacks rotate to provide variety across multiple calls.
 * @param category - The image category for fallbacks
 * @param primaryUrl - The primary URL to try first
 * @returns Promise that resolves with a working image URL
 */
export async function loadImageWithFallback(
  category: FocusImageCategory,
  primaryUrl: string
): Promise<string> {
  // Try primary URL first
  try {
    return await preloadImage(primaryUrl);
  } catch {
    // Primary failed (503, rate limit, etc.), use rotating fallback
    const fallbacks = FALLBACK_IMAGE_IDS[category];

    // Try each fallback starting from the next in rotation
    for (let attempt = 0; attempt < fallbacks.length; attempt++) {
      try {
        // getFallbackImageUrl without index will rotate automatically
        const fallbackUrl = getFallbackImageUrl(category);
        return await preloadImage(fallbackUrl, 5000); // Shorter timeout for fallbacks
      } catch {
        // Continue to next fallback
      }
    }
    // All fallbacks failed - component should show solid color
    throw new Error('All image sources failed');
  }
}
