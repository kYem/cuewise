import { APP_LINKS } from '@cuewise/shared';

interface FeatureRequestOptions {
  /** Which surface raised it. Must satisfy SOURCE_PATTERN in the request handler. */
  source: 'settings';
}

/** Deep link to the hosted request form. */
export function featureRequestUrl({ source }: FeatureRequestOptions): string {
  const url = new URL(APP_LINKS.featureRequest);
  url.searchParams.set('source', source);
  url.searchParams.set('v', __APP_VERSION__);
  return url.toString();
}
