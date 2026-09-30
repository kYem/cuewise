import { logger } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeNotionHost } from './chrome-notion-host';

const REDIRECT_URI = 'https://abjkbnhoepcnmbabflkedbapbldnpkbf.chromiumapp.org/notion';
const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize?state=s';

const identity = {
  getRedirectURL: vi.fn(
    (path: string) => `https://abjkbnhoepcnmbabflkedbapbldnpkbf.chromiumapp.org/${path}`
  ),
  launchWebAuthFlow: vi.fn(
    (): Promise<string | undefined> => Promise.resolve(`${REDIRECT_URI}?code=one-time`)
  ),
};
const permissions = { request: vi.fn((): Promise<boolean> => Promise.resolve(true)) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  identity.launchWebAuthFlow.mockResolvedValue(`${REDIRECT_URI}?code=one-time`);
  permissions.request.mockResolvedValue(true);
  (chrome as unknown as { identity: typeof identity }).identity = identity;
  (chrome as unknown as { permissions: typeof permissions }).permissions = permissions;
});

describe('createChromeNotionHost', () => {
  it('asks for identity before starting, then opens consent for the URL start built', async () => {
    const start = vi.fn(async () => AUTHORIZE_URL);
    const host = createChromeNotionHost('https://api.cuewise.app');

    const redirect = await host.authorize(start);

    expect(redirect).toBe(`${REDIRECT_URI}?code=one-time`);
    expect(start).toHaveBeenCalledWith(REDIRECT_URI);
    expect(permissions.request.mock.invocationCallOrder[0]).toBeLessThan(
      start.mock.invocationCallOrder[0] ?? 0
    );
    expect(identity.launchWebAuthFlow).toHaveBeenCalledWith({
      url: AUTHORIZE_URL,
      interactive: true,
    });
  });

  it('starts nothing when the identity permission is refused', async () => {
    permissions.request.mockResolvedValue(false);
    const start = vi.fn(async () => AUTHORIZE_URL);

    await expect(
      createChromeNotionHost('https://api.cuewise.app').authorize(start)
    ).resolves.toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it('answers null when the consent window is closed', async () => {
    identity.launchWebAuthFlow.mockRejectedValue(new Error('The user did not approve access.'));

    await expect(
      createChromeNotionHost('https://api.cuewise.app').authorize(async () => AUTHORIZE_URL)
    ).resolves.toBeNull();
  });
});
