import { stubMatchMedia } from './media-query.fixtures';

/** Stubs window.matchMedia so prefers-reduced-motion resolves to `matches`. */
export function setReducedMotion(matches: boolean) {
  stubMatchMedia(matches);
}
