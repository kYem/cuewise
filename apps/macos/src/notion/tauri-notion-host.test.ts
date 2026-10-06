import { logger } from '@cuewise/shared';
import { SessionManager } from '@cuewise/sync-client';
import { FakeKvStore } from '@cuewise/sync-engine/src/__fixtures__/fake-kv-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeOAuthDriver,
  hangingOAuthDriver,
} from '../platform/__fixtures__/oauth-driver.fixtures';
import type { OAuthDriver } from '../platform/oauth-driver';
import { createTauriNotionHost, NOTION_RETURN_URI } from './tauri-notion-host';

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize?state=s';
const RETURNED = `${NOTION_RETURN_URI}?code=one-time`;

function hostOver(oauthDriver: OAuthDriver, fetchFn?: typeof fetch, keyStore = new FakeKvStore()) {
  return createTauriNotionHost({
    baseUrl: 'https://api.cuewise.app',
    keyStore,
    oauthDriver,
    fetchFn,
  });
}

beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
});

describe('createTauriNotionHost', () => {
  it('starts with the cuewise://notion return URI and opens consent for the URL start built', async () => {
    const fake = fakeOAuthDriver(RETURNED);
    const start = vi.fn(async () => AUTHORIZE_URL);

    const redirect = await hostOver(fake.driver).authorize(start);

    expect(redirect).toBe(RETURNED);
    expect(start).toHaveBeenCalledWith('cuewise://notion');
    expect(fake.calls).toEqual([AUTHORIZE_URL]);
  });

  it('answers null when the user cancels a pending consent', async () => {
    const driver = hangingOAuthDriver();
    const host = hostOver(driver);
    const redirect = host.authorize(async () => AUTHORIZE_URL);
    await driver.waitForPending();

    host.cancel();

    await expect(redirect).resolves.toBeNull();
  });

  it('opens no browser when the user cancels while consent is still being started', async () => {
    const fake = fakeOAuthDriver(RETURNED);
    const host = hostOver(fake.driver);

    const redirect = await host.authorize(async () => {
      host.cancel();
      return AUTHORIZE_URL;
    });

    expect(redirect).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('opens consent on the next connect after a cancelled one', async () => {
    const fake = fakeOAuthDriver(RETURNED);
    const host = hostOver(fake.driver);
    await host.authorize(async () => {
      host.cancel();
      return AUTHORIZE_URL;
    });

    const redirect = await host.authorize(async () => AUTHORIZE_URL);

    expect(redirect).toBe(RETURNED);
    expect(fake.calls).toEqual([AUTHORIZE_URL]);
  });

  it('rethrows a consent flow that failed, so the store can report it', async () => {
    const fake = fakeOAuthDriver(new Error('no browser available'));

    await expect(hostOver(fake.driver).authorize(async () => AUTHORIZE_URL)).rejects.toThrow(
      'no browser available'
    );
  });

  it("calls the API through the given fetch with the sync engine's session", async () => {
    const keyStore = new FakeKvStore();
    await new SessionManager(keyStore).saveToken('session-token');
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ workspace: 'Acme', dataSourceId: null, tableName: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );

    await hostOver(fakeOAuthDriver(RETURNED).driver, fetchFn, keyStore).api.getNotionConnection();

    const init = fetchFn.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer session-token');
  });
});
