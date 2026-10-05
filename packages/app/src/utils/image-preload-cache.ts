import type { FocusImageCategory } from '@cuewise/shared';
import { logger } from '@cuewise/shared';
import { clearDailyBackground, getDailyBackground, setDailyBackground } from '@cuewise/storage';
import { ImageLoadTimeoutError, loadImageWithFallback, preloadImage } from './unsplash';

interface PreloadCache {
  currentUrl: string | null;
  category: FocusImageCategory | null;
  isInitialized: boolean;
}

// The user's own image. Readers get it via getPreloadedCurrentUrl, but rotation paths
// (focus mode's next-image) must check getCustomBackgroundOverride themselves.
let customOverride: string | null = null;

/** Set by the background store; null restores the curated rotation. */
export function setCustomBackgroundOverride(dataUrl: string | null): void {
  customOverride = dataUrl;
}

/** The user's own image, or null when the curated rotation is in charge. */
export function getCustomBackgroundOverride(): string | null {
  return customOverride;
}

let inFlight: { category: FocusImageCategory; promise: Promise<ResolvedBackground> } | null = null;

/** The newest resolve owns the cache; an older one landing later must not write or unregister. */
function ownsResolve(promise: Promise<ResolvedBackground>): boolean {
  return inFlight?.promise === promise;
}

const cache: PreloadCache = {
  currentUrl: null,
  category: null,
  isInitialized: false,
};

// Bounds how long callers wait for a stored photo before it is handed back still loading.
const STORED_HOLD_MS = 8000;
// How long a photo handed back still loading gets before it counts as hung and is dropped.
const STORED_GIVE_UP_MS = 60_000;

/** A photo that never lands is dropped here and from storage, so the next caller re-picks. */
function forgetIfHung(url: string): void {
  // Same URL as the running request, so this rides it rather than starting a rival download.
  preloadImage(url, STORED_GIVE_UP_MS).catch(async (error) => {
    logger.error(`Stored background never loaded; dropping it: ${url}`, error);
    if (cache.currentUrl === url) {
      cache.currentUrl = null;
      cache.isInitialized = false;
    }
    await clearDailyBackground(url);
  });
}

/** Slow is kept, not replaced: the request is still running and it was validated when stored. */
async function storedLoadState(url: string): Promise<'loaded' | 'loading' | 'dead'> {
  try {
    await preloadImage(url, STORED_HOLD_MS);
    return 'loaded';
  } catch (error) {
    return error instanceof ImageLoadTimeoutError ? 'loading' : 'dead';
  }
}

interface ResolvedBackground {
  url: string | null;
  stillLoading: boolean;
  /** Freshly picked, so the owner persists it; a superseded pick must not reach storage. */
  picked: boolean;
}

/**
 * A stored photo is revalidated rather than trusted — one Unsplash has since removed must not
 * stick for the day. Null when no fresh pick lands either.
 */
async function resolveDailyBackground(category: FocusImageCategory): Promise<ResolvedBackground> {
  const stored = await getDailyBackground(category);
  if (stored) {
    const state = await storedLoadState(stored.url);
    if (state !== 'dead') {
      return { url: stored.url, stillLoading: state === 'loading', picked: false };
    }
  }

  try {
    const url = await loadImageWithFallback(category);
    return { url, stillLoading: false, picked: true };
  } catch (error) {
    // error, not warn: at the shipped level this is the only trace a blocked CDN leaves.
    logger.error('No background image could be loaded; showing the solid fallback', error);
    return { url: null, stillLoading: false, picked: false };
  }
}

async function pickFreshBackground(category: FocusImageCategory): Promise<ResolvedBackground> {
  try {
    const url = await loadImageWithFallback(category);
    return { url, stillLoading: false, picked: true };
  } catch (error) {
    // error, not warn: this is a user-initiated click, and warn is invisible by default.
    logger.error('Could not load a new background; keeping the current one', error);
    return { url: null, stillLoading: false, picked: false };
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

  if (cache.isInitialized && cache.category === category && cache.currentUrl) {
    return;
  }

  // Concurrent callers would otherwise each pick and persist a different photo.
  // The owner writes the cache before any waiter resumes, so waiters just await.
  if (inFlight !== null && inFlight.category === category) {
    await inFlight.promise;
    return;
  }

  const promise = resolveDailyBackground(category);
  inFlight = { category, promise };
  try {
    const { url, stillLoading, picked } = await promise;
    if (!ownsResolve(promise)) {
      return;
    }
    cache.category = category;
    cache.currentUrl = url;
    cache.isInitialized = true;
    // After the cache write, so a fast failure cannot be overwritten by the URL it just dropped.
    if (url !== null && stillLoading) {
      forgetIfHung(url);
    }
    if (url !== null && picked) {
      await setDailyBackground(url, category);
    }
  } finally {
    if (ownsResolve(promise)) {
      inFlight = null;
    }
  }
}

/**
 * Pick a fresh background on demand, replacing today's. Unlike preloadImages this
 * skips the persisted image entirely — the point is to move past it. The current
 * background is left untouched if nothing new loads, so a refresh can't blank the page.
 */
export async function refreshBackground(category: FocusImageCategory): Promise<string | null> {
  // The UI hides the refresh control over a custom image; guard here too so the
  // rotation can't overwrite it if another caller ever appears.
  if (customOverride !== null) {
    return null;
  }

  // Claimed like a daily resolve, so an older one landing later cannot overwrite this pick
  // and a concurrent preloadImages awaits it instead of picking a rival.
  const promise = pickFreshBackground(category);
  inFlight = { category, promise };
  try {
    const { url } = await promise;
    // Superseded or failed: null tells App to leave the current background.
    if (url === null || !ownsResolve(promise)) {
      return null;
    }
    cache.category = category;
    cache.currentUrl = url;
    cache.isInitialized = true;
    await setDailyBackground(url, category);
    return url;
  } finally {
    if (ownsResolve(promise)) {
      inFlight = null;
    }
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

/** Leaves the custom override alone — that belongs to the background store. */
export function clearPreloadCache(): void {
  cache.currentUrl = null;
  cache.category = null;
  cache.isInitialized = false;
  inFlight = null;
}
