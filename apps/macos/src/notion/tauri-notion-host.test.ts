import { logger } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthDriver } from '../platform/oauth-driver';
import { createTauriNotionHost, NOTION_RETURN_URI } from './tauri-notion-host';

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize?state=s';
const RETURNED = `${NOTION_RETURN_URI}?code=one-time`;

function fakeDriver(): OAuthDriver & { authorize: ReturnType<typeof vi.fn> } {
  return { authorize: vi.fn(async () => RETURNED), cancel: vi.fn() };
}

function hostOver(oauthDriver: OAuthDriver) {
  return createTauriNotionHost({
    baseUrl: 'https://api.cuewise.app',
    keyStore: new LocalStorageKeyValueStore(),
    oauthDriver,
  });
}

beforeEach(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

describe('createTauriNotionHost', () => {
  it('starts with the cuewise://notion return URI and opens consent for the URL start built', async () => {
    const driver = fakeDriver();
    const start = vi.fn(async () => AUTHORIZE_URL);

    const redirect = await hostOver(driver).authorize(start);

    expect(redirect).toBe(RETURNED);
    expect(start).toHaveBeenCalledWith('cuewise://notion');
    expect(driver.authorize).toHaveBeenCalledWith(AUTHORIZE_URL);
  });

  it('answers null when the consent callback never arrives', async () => {
    const driver = fakeDriver();
    driver.authorize.mockRejectedValue(new Error('Timed out waiting for the sign-in callback'));

    await expect(hostOver(driver).authorize(async () => AUTHORIZE_URL)).resolves.toBeNull();
  });
});
