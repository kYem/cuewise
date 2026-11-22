import type { FocusImageCategory } from '@cuewise/shared';

const ASSETS_ORIGIN = 'https://assets.cuewise.app';

/** Themes whose images we generate and host ourselves rather than take from Unsplash. */
export type HostedCategory = 'anime';

/** File names (without `.webp`) under `backgrounds/<category>/` in the cuewise-assets R2 bucket. */
export const HOSTED_ART: Record<HostedCategory, readonly string[]> = {
  anime: [
    'above-the-cloudline',
    'alpine-sunrise',
    'autumn-reading-room',
    'firefly-irrigation-canal',
    'first-snow-platform',
    'forest-shrine',
    'lemon-grove-steps',
    'meadow-observatory',
    'moonlit-tidal-flats',
    'neon-transit',
    'old-cinema-at-dawn',
    'orbital-night-window',
    'paper-lantern-harbor',
    'pheasant-feather-pass',
    'rain-on-the-greenhouse',
    'rainy-blue-hour',
    'rooftop-kite',
    'saltwind-lighthouse',
    'snowmelt-footbridge',
    'wisteria-courtyard',
  ],
};

export function isHostedCategory(category: FocusImageCategory): category is HostedCategory {
  return category in HOSTED_ART;
}

/** Served immutable for a year: replace an image under a new slug, never in place. */
export function hostedArtUrl(category: HostedCategory, slug: string): string {
  return `${ASSETS_ORIGIN}/backgrounds/${category}/${slug}.webp`;
}

/** 400px-wide preview of the same image, for the theme picker. */
export function hostedThumbUrl(category: HostedCategory, slug: string): string {
  return `${ASSETS_ORIGIN}/backgrounds/${category}/thumbs/${slug}.webp`;
}

const HOSTED_ART_URL = /^https:\/\/assets\.cuewise\.app\/backgrounds\/[a-z]+\/([a-z0-9-]+)\.webp$/;

export function isHostedArtUrl(url: string): boolean {
  return HOSTED_ART_URL.test(url);
}

/** The slug as a caption ("rainy-blue-hour" → "Rainy blue hour"); null for any other URL. */
export function getHostedArtTitle(url: string): string | null {
  const slug = HOSTED_ART_URL.exec(url)?.[1];
  if (slug === undefined) {
    return null;
  }
  const words = slug.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
