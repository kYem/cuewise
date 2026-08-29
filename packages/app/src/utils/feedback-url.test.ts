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

  it('emits a version the request handler will accept, not one it files as unknown', () => {
    const url = new URL(featureRequestUrl({ source: 'settings' }));

    // Mirrors VERSION_PATTERN in apps/website/functions/api/feedback/request.ts.
    expect(url.searchParams.get('v')).toMatch(/^[\d.]{1,20}$/);
    expect(url.searchParams.get('v')).toBe(__APP_VERSION__);
  });

  it('keeps the trailing slash, so the deep link does not cost a redirect hop', () => {
    expect(new URL(featureRequestUrl({ source: 'settings' })).pathname).toBe('/feedback/');
  });
});
