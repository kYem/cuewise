import type { FocusImageCategory } from '@cuewise/shared';

/**
 * Unsplash image utility for focus mode backgrounds.
 * Uses curated images from images.unsplash.com (direct CDN).
 * Note: source.unsplash.com was deprecated in 2024.
 */

// Curated high-quality image IDs from Unsplash (10 per category)
const CURATED_IMAGE_IDS: Record<FocusImageCategory, string[]> = {
  nature: [
    'photo-1469474968028-56623f02e42e', // Mountain lake sunrise
    'photo-1426604966848-d7adac402bff', // Forest valley
    'photo-1470071459604-3b5ec3a7fe05', // Foggy mountains
    'photo-1472214103451-9374bd1c798e', // Green hills
    'photo-1433086966358-54859d0ed716', // Waterfall
    'photo-1501854140801-50d01698950b', // Aerial forest
    'photo-1441974231531-c6227db76b6e', // Sunlit forest
    'photo-1518173946687-a4c036bc6c9f', // Aurora borealis
    'photo-1475924156734-496f6cac6ec1', // Mountain reflection
    'photo-1465056836041-7f43ac27dcb5', // Valley vista
  ],
  forest: [
    'photo-1448375240586-882707db888b', // Forest path
    'photo-1542273917363-3b1817f69a2d', // Green forest
    'photo-1511497584788-876760111969', // Misty forest
    'photo-1440342359743-84fcb8c21f21', // Redwood trees
    'photo-1473448912268-2022ce9509d8', // Autumn forest
    'photo-1502082553048-f009c37129b9', // Sunbeams through trees
    'photo-1476231682828-37e571bc172f', // Forest stream
    'photo-1425913397330-cf8af2ff40a1', // Dense woodland
    'photo-1503435824048-a799a3a84bf7', // Bamboo forest
    'photo-1523712999610-f77fbcfc3843', // Foggy pine forest
  ],
  ocean: [
    'photo-1505142468610-359e7d316be0', // Ocean waves
    'photo-1507525428034-b723cf961d3e', // Beach sunset
    'photo-1439405326854-014607f694d7', // Calm sea
    'photo-1518837695005-2083093ee35b', // Turquoise water
    'photo-1484291470158-b8f8d608850d', // Ocean horizon
    'photo-1519046904884-53103b34b206', // Tropical beach
    'photo-1506929562872-bb421503ef21', // Beach aerial
    'photo-1520942702018-0862c8c89e7d', // Peaceful shore
    'photo-1468413253725-0d5181091126', // Coastal rocks
    'photo-1494791368093-85217fbbf8de', // Sea waves
  ],
  mountains: [
    'photo-1464822759023-fed622ff2c3b', // Mountain peak
    'photo-1506905925346-21bda4d32df4', // Snow mountains
    'photo-1454496522488-7a8e488e8606', // Mountain range
    'photo-1519681393784-d120267933ba', // Starry mountains
    'photo-1486870591958-9b9d0d1dda99', // Alpine lake
    'photo-1483728642387-6c3bdd6c93e5', // Mountain mist
    'photo-1434394354979-a235cd36269d', // Rocky peaks
    'photo-1445363692815-ebcd599f7621', // Mountain meadow
    'photo-1458668383970-8ddd3927deed', // Swiss Alps
    'photo-1477346611705-65d1883cee1e', // Misty mountains
  ],
  minimal: [
    'photo-1557682250-33bd709cbe85', // Gradient purple
    'photo-1558591710-4b4a1ae0f04d', // Abstract waves
    'photo-1557683316-973673baf926', // Minimal gradient
    'photo-1553356084-58ef4a67b2a7', // Pink gradient
    'photo-1557682224-5b8590cd9ec5', // Blue gradient
    'photo-1579546929518-9e396f3cc809', // Colorful gradient
    'photo-1557682260-96773eb01377', // Soft gradient
    'photo-1550684848-fac1c5b4e853', // Geometric minimal
    'photo-1557683311-eac922347aa1', // Abstract blue
    'photo-1528459801416-a9e53bbf4e17', // Soft pastel
  ],
  dark: [
    'photo-1419242902214-272b3f66ee7a', // Night sky stars
    'photo-1507400492013-162706c8c05e', // Dark forest
    'photo-1472552944129-b035e9ea3744', // Night cityscape
    'photo-1536183922588-166604504d5e', // Milky way
    'photo-1505506145022-f4566f827796', // Dark clouds
    'photo-1477346611705-65d1883cee1e', // Moody mountains
    'photo-1489549132488-d00b7eee80f1', // Night road
    'photo-1475274047050-1d0c0975c63e', // Starry night
    'photo-1507608616759-54f48f0af0ee', // Dark ocean
    'photo-1488866022504-f2584929ca5f', // Night forest
  ],
};

// Track last used index per category to avoid immediate repeats
const lastUsedIndex: Record<FocusImageCategory, number> = {
  nature: -1,
  forest: -1,
  ocean: -1,
  mountains: -1,
  minimal: -1,
  dark: -1,
};

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
  const images = CURATED_IMAGE_IDS[category];
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

  const imageId = images[selectedIndex];
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
  const images = CURATED_IMAGE_IDS[category];

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
