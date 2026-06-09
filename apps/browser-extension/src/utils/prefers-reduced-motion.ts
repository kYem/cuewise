/**
 * Whether the user has requested reduced motion. jsdom-safe: returns false when
 * window/matchMedia is unavailable.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
