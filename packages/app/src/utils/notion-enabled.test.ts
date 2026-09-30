import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNotionEnabled } from './notion-enabled';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isNotionEnabled', () => {
  it('is off when no client id was supplied', () => {
    vi.stubEnv('VITE_NOTION_CLIENT_ID', '');

    expect(isNotionEnabled()).toBe(false);
  });

  it('is off for a client id that is only whitespace', () => {
    vi.stubEnv('VITE_NOTION_CLIENT_ID', '  ');

    expect(isNotionEnabled()).toBe(false);
  });

  it('is on once a client id is supplied', () => {
    vi.stubEnv('VITE_NOTION_CLIENT_ID', 'test-client-id');

    expect(isNotionEnabled()).toBe(true);
  });
});
