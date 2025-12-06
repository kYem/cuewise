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
// These are used when the random source fails
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
 * Get a fallback image URL from our known-good list.
 * @param category - The image category
 * @param index - Optional index for specific fallback (default: random)
 * @returns Direct Unsplash image URL
 */
export function getFallbackImageUrl(category: FocusImageCategory, index?: number): string {
  const fallbacks = FALLBACK_IMAGE_IDS[category];
  const selectedIndex =
    index !== undefined ? index % fallbacks.length : Math.floor(Math.random() * fallbacks.length);
  const imageId = fallbacks[selectedIndex];
  // Use direct Unsplash image URL format
  return `https://images.unsplash.com/${imageId}?w=1920&h=1080&fit=crop&auto=format`;
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
    // Primary failed, try fallbacks
    const fallbacks = FALLBACK_IMAGE_IDS[category];
    for (let i = 0; i < fallbacks.length; i++) {
      try {
        const fallbackUrl = getFallbackImageUrl(category, i);
        return await preloadImage(fallbackUrl, 5000); // Shorter timeout for fallbacks
      } catch {
        // Continue to next fallback
      }
    }
    // All fallbacks failed - return empty string (component should show solid color)
    throw new Error('All image sources failed');
  }
}
