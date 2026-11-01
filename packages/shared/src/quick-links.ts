import type { QuickLink } from './types';

/**
 * Normalize a user-entered URL into an absolute http(s) URL. Prepends https://
 * when no protocol is given. Returns null for anything that isn't a valid
 * http/https URL with a dotted hostname (catch handles URL parse failure).
 */
export function normalizeQuickLinkUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!url.hostname.includes('.')) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Derive a display title from a URL's hostname (drops a leading "www.").
 */
export function deriveQuickLinkTitle(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Single-character monogram for a quick link, used when no favicon is available.
 */
export function quickLinkMonogram(link: QuickLink): string {
  const source = link.title.trim() || deriveQuickLinkTitle(link.url);
  // Array.from splits by code point, so a leading emoji isn't cut into a lone surrogate.
  const [firstChar] = Array.from(source.trim());
  return firstChar ? firstChar.toUpperCase() : '?';
}
