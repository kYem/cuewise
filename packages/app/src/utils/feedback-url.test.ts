import { APP_LINKS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { featureRequestUrl } from './feedback-url';

describe('featureRequestUrl', () => {
  it('points at the shared feature-request link, not a second copy of the host', () => {
    expect(featureRequestUrl({ source: 'settings' })).toContain(APP_LINKS.featureRequest);
  });

  it('carries the source, so a widget ask is separable from a general one', () => {
    const url = new URL(featureRequestUrl({ source: 'widget-picker' }));

    expect(url.searchParams.get('source')).toBe('widget-picker');
  });

  it('carries the running version, so a request can be read against what they saw', () => {
    const url = new URL(featureRequestUrl({ source: 'settings' }));

    expect(url.searchParams.get('v')).toBe(__APP_VERSION__);
  });

  it('preselects an area when the caller knows it', () => {
    const url = new URL(featureRequestUrl({ source: 'widget-picker', area: 'widgets' }));

    expect(url.searchParams.get('area')).toBe('widgets');
  });

  it('leaves the area unset when the caller does not know it', () => {
    const url = new URL(featureRequestUrl({ source: 'settings' }));

    expect(url.searchParams.has('area')).toBe(false);
  });
});
