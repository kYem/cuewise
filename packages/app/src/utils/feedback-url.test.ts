import { APP_LINKS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { featureRequestUrl } from './feedback-url';

describe('featureRequestUrl', () => {
  it('points at the shared feature-request link', () => {
    expect(featureRequestUrl({ source: 'settings' })).toContain(APP_LINKS.featureRequest);
  });

  it('carries the source, so requests stay separable by where they were raised', () => {
    const url = new URL(featureRequestUrl({ source: 'settings' }));

    expect(url.searchParams.get('source')).toBe('settings');
  });

  it('carries the running version, so a request can be read against what they saw', () => {
    const url = new URL(featureRequestUrl({ source: 'settings' }));

    expect(url.searchParams.get('v')).toBe(__APP_VERSION__);
  });

  it('keeps the trailing slash, so the deep link does not cost a redirect hop', () => {
    expect(new URL(featureRequestUrl({ source: 'settings' })).pathname).toBe('/feedback/');
  });
});
