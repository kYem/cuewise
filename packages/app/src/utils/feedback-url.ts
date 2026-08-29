import { APP_LINKS } from '@cuewise/shared';

interface FeatureRequestOptions {
  /** Which surface raised it — kept short and hyphenated to match the page's own validation. */
  source: 'settings' | 'widget-picker';
  /** Preselects the matching radio on the form when the caller already knows the area. */
  area?: 'widgets';
}

/** Deep link to the hosted request form — no account needed, unlike GitHub Discussions. */
export function featureRequestUrl({ source, area }: FeatureRequestOptions): string {
  const url = new URL(APP_LINKS.featureRequest);
  url.searchParams.set('source', source);
  url.searchParams.set('v', __APP_VERSION__);
  if (area !== undefined) {
    url.searchParams.set('area', area);
  }
  return url.toString();
}
