import { APP_LINKS } from '@cuewise/shared';

interface FeatureRequestOptions {
  /** App-side callers only — the website links to the form with its own sources. */
  source: 'settings';
}

export function featureRequestUrl({ source }: FeatureRequestOptions): string {
  const url = new URL(APP_LINKS.featureRequest);
  url.searchParams.set('source', source);
  url.searchParams.set('v', __APP_VERSION__);
  return url.toString();
}
