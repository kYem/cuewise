import { logger } from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import { decryptSecret, encryptSecret, randomToken, signState, verifyState } from '../crypto-utils';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import {
  NotionAuthError,
  type NotionClient,
  NotionConfigError,
  type NotionDataSource,
  NotionUnavailableError,
} from '../notion-client';
import { type CompletionProperty, findCompletionProperty } from '../notion-schema';
import { problem } from '../problem-details';
import type { ProviderConnection, SyncStore } from '../store';
import { isAllowedReturnUri, requireStateSigningKey, respondWithDeepLink } from './bounce-shared';

const PROVIDER = 'notion';
const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';

/**
 * Unlike the sign-in bounces, this state carries `userId`: a browser redirect brings no Bearer
 * token, so the callback has no other way to know whose account is connecting. Safe only because
 * the whole blob is HMAC-signed — see gotcha 4 in this package's CLAUDE.md. The alternative,
 * putting a session token in the URL, is something this package deliberately never does.
 */
interface NotionConnectState {
  userId: string;
  returnUri: string;
  nonce: string;
}

function toConnectState(parsed: unknown): NotionConnectState | null {
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as { userId?: unknown; returnUri?: unknown; nonce?: unknown };
  if (
    typeof record.userId !== 'string' ||
    typeof record.returnUri !== 'string' ||
    typeof record.nonce !== 'string'
  ) {
    return null;
  }
  return { userId: record.userId, returnUri: record.returnUri, nonce: record.nonce };
}

/** Sanitized vocabulary for the deep link; nothing attacker-shaped rides back to the app. */
type ConnectOutcome = 'connected' | 'access_denied' | 'connect_failed' | 'server_error';

function returnToApp(returnUri: string, outcome: ConnectOutcome): Response {
  const target = new URL(returnUri);
  if (outcome === 'connected') {
    target.searchParams.set('connected', PROVIDER);
    return respondWithDeepLink(target, 'Notion is connected.');
  }
  target.searchParams.set('error', outcome);
  return respondWithDeepLink(target, "Connecting Notion didn't complete — return to Cuewise.");
}

/** Everything a route needs from a stored grant, with the token already opened. */
interface OpenConnection {
  connection: ProviderConnection;
  accessToken: string;
}

async function openConnection(
  store: SyncStore,
  userId: string,
  env: Env
): Promise<OpenConnection | null> {
  const connection = await store.getProviderConnection(userId, PROVIDER);
  if (connection === null) {
    return null;
  }
  const accessToken = await decryptSecret(
    connection.ciphertext,
    connection.iv,
    env.PROVIDER_TOKEN_KEY
  );
  return { connection, accessToken };
}

async function sealGrant(
  grant: { accessToken: string; refreshToken: string | null },
  key: string
): Promise<Pick<ProviderConnection, 'ciphertext' | 'iv' | 'refreshCiphertext' | 'refreshIv'>> {
  const access = await encryptSecret(grant.accessToken, key);
  if (grant.refreshToken === null) {
    return {
      ciphertext: access.ciphertext,
      iv: access.iv,
      refreshCiphertext: null,
      refreshIv: null,
    };
  }
  const refresh = await encryptSecret(grant.refreshToken, key);
  return {
    ciphertext: access.ciphertext,
    iv: access.iv,
    refreshCiphertext: refresh.ciphertext,
    refreshIv: refresh.iv,
  };
}

/**
 * Runs `attempt` with the stored access token; on an auth fault, renews once with the stored
 * refresh token and runs it again. Notion declares `refresh_token` as nullable and documents no
 * `expires_in`, so whether a grant expires cannot be known up front — retrying on the 401 covers
 * both behaviours and needs no scheduler. A connection with no refresh token, or a renewal that
 * itself fails, falls through to `providerProblem`, which drops the grant.
 */
async function withFreshToken<T>(
  open: OpenConnection,
  client: NotionClient,
  store: SyncStore,
  userId: string,
  env: Env,
  attempt: (accessToken: string) => Promise<T>
): Promise<T> {
  try {
    return await attempt(open.accessToken);
  } catch (error) {
    const { refreshCiphertext, refreshIv } = open.connection;
    if (!(error instanceof NotionAuthError) || refreshCiphertext === null || refreshIv === null) {
      throw error;
    }
    const refreshToken = await decryptSecret(refreshCiphertext, refreshIv, env.PROVIDER_TOKEN_KEY);
    const grant = await client.refreshGrant(refreshToken);
    const sealed = await sealGrant(grant, env.PROVIDER_TOKEN_KEY);
    await store.putProviderConnection(userId, {
      ...open.connection,
      ...sealed,
      workspace: grant.workspace ?? open.connection.workspace,
    });
    return attempt(grant.accessToken);
  }
}

/**
 * Maps a provider failure onto our error contract. An auth fault also drops the stored grant:
 * a revoked token can never recover, so keeping it would leave the UI offering a connection
 * that cannot work.
 */
async function providerProblem(
  error: unknown,
  store: SyncStore,
  userId: string
): Promise<Response> {
  if (error instanceof NotionAuthError) {
    await store.deleteProviderConnection(userId, PROVIDER);
    return problem('provider_reauth_required');
  }
  if (error instanceof NotionUnavailableError) {
    return problem('upstream_unavailable');
  }
  if (error instanceof NotionConfigError) {
    // Our credentials, not the user's grant — nothing they can do, so it must be loud.
    logger.error('Notion rejected our client configuration', error);
    return problem('internal');
  }
  throw error;
}

function credentialsConfigured(env: Env): boolean {
  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET || !env.PROVIDER_TOKEN_KEY) {
    logger.error('Notion integration credentials are not configured');
    return false;
  }
  return true;
}

export function registerNotionRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  function client(env: Env): NotionClient {
    return deps.notionClientFactory(env);
  }

  // Authenticated and answers JSON rather than a 302: the app needs to prove who it is before
  // we mint a state naming its account, and only then opens the URL itself.
  app.get('/v1/integrations/notion/start', async (c) => {
    const returnUri = c.req.query('return_uri') ?? '';
    if (!isAllowedReturnUri(returnUri, c.env)) {
      return problem('invalid_request', {
        errors: [{ pointer: '/return_uri', detail: 'return_uri is not allowlisted.' }],
      });
    }
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null || !credentialsConfigured(c.env)) {
      return problem('internal');
    }
    const state = await signState(
      { userId: c.get('userId'), returnUri, nonce: randomToken() },
      signingKey
    );
    const url = new URL(NOTION_AUTHORIZE_URL);
    url.searchParams.set('client_id', c.env.NOTION_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('owner', 'user');
    url.searchParams.set(
      'redirect_uri',
      `${c.env.PUBLIC_BASE_URL}/v1/integrations/notion/callback`
    );
    url.searchParams.set('state', state);
    return c.json({ authorizeUrl: url.toString() });
  });

  // Unauthenticated by necessity — Notion redirects a browser here. The signed state is the only
  // thing that says whose account this is, which is why nothing else in it may be trusted.
  app.get('/v1/integrations/notion/callback', async (c) => {
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null) {
      return problem('internal');
    }
    const rawState = c.req.query('state') ?? '';
    if (rawState === '') {
      return problem('invalid_request', { detail: 'state is required.' });
    }
    const verified = await verifyState(rawState, signingKey);
    if (!verified.ok) {
      if (verified.reason === 'key_unavailable') {
        return problem('internal');
      }
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    const state = toConnectState(verified.payload);
    if (state === null) {
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    // Past this line the return URI is proven ours, so failures ride back to the app rather
    // than stranding its pending flow on a problem+json page.
    const denied = c.req.query('error');
    if (denied !== undefined) {
      return returnToApp(state.returnUri, 'access_denied');
    }
    const code = c.req.query('code') ?? '';
    if (code === '' || !credentialsConfigured(c.env)) {
      return returnToApp(state.returnUri, 'server_error');
    }
    try {
      const grant = await client(c.env).exchangeCode(code);
      const sealed = await sealGrant(grant, c.env.PROVIDER_TOKEN_KEY);
      // Stored without a table: which one to mirror is a separate choice the user has not made
      // yet, because Notion's token response names none of the pages they shared.
      await deps.storeFactory(c.env.DB).putProviderConnection(state.userId, {
        provider: PROVIDER,
        ...sealed,
        workspace: grant.workspace,
        databaseId: null,
        dataSourceId: null,
      });
      return returnToApp(state.returnUri, 'connected');
    } catch (error) {
      if (error instanceof NotionConfigError) {
        logger.error('Notion rejected our client configuration', error);
        return returnToApp(state.returnUri, 'server_error');
      }
      logger.error('Notion connect failed', error);
      return returnToApp(state.returnUri, 'connect_failed');
    }
  });

  // Phase two of connecting: the tables the user shared, for them to pick from.
  app.get('/v1/integrations/notion/tables', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const open = await openConnection(store, userId, c.env);
    if (open === null) {
      return problem('provider_not_connected');
    }
    let tables: NotionDataSource[];
    try {
      tables = await withFreshToken(open, client(c.env), store, userId, c.env, (token) =>
        client(c.env).searchDataSources(token)
      );
    } catch (error) {
      return providerProblem(error, store, userId);
    }
    return c.json({ workspace: open.connection.workspace, tables });
  });

  // Phase three: validate the pick and remember it. Refusing here rather than at read time is
  // what turns "nothing ever completes" into a message naming the requirement.
  app.put('/v1/integrations/notion/selection', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problem('invalid_request', { detail: 'Body must be JSON.' });
    }
    const record = body as { dataSourceId?: unknown } | null;
    const dataSourceId = record === null ? undefined : record.dataSourceId;
    if (typeof dataSourceId !== 'string' || dataSourceId === '') {
      return problem('invalid_request', {
        errors: [{ pointer: '/dataSourceId', detail: 'dataSourceId must be a non-empty string.' }],
      });
    }
    const open = await openConnection(store, userId, c.env);
    if (open === null) {
      return problem('provider_not_connected');
    }
    let property: CompletionProperty | null;
    try {
      const schema = await withFreshToken(open, client(c.env), store, userId, c.env, (token) =>
        client(c.env).getDataSource(token, dataSourceId)
      );
      property = findCompletionProperty(schema);
    } catch (error) {
      return providerProblem(error, store, userId);
    }
    if (property === null) {
      return problem('provider_schema_unusable');
    }
    await store.putProviderConnection(userId, {
      ...open.connection,
      dataSourceId,
    });
    return c.json({ dataSourceId, completion: property.kind });
  });

  app.get('/v1/integrations/notion/items', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const open = await openConnection(store, userId, c.env);
    if (open === null || open.connection.dataSourceId === null) {
      return problem('provider_not_connected');
    }
    const dataSourceId = open.connection.dataSourceId;
    try {
      // The schema is re-read every time rather than cached: a renamed property must surface as
      // a prompt, and a stale cached shape would instead write completion into the wrong field.
      const items = await withFreshToken(
        open,
        client(c.env),
        store,
        userId,
        c.env,
        async (token) => {
          const schema = await client(c.env).getDataSource(token, dataSourceId);
          const property = findCompletionProperty(schema);
          if (property === null) {
            return null;
          }
          return client(c.env).queryRows(token, dataSourceId, property);
        }
      );
      if (items === null) {
        return problem('provider_schema_unusable');
      }
      return c.json({ workspace: open.connection.workspace, items });
    } catch (error) {
      return providerProblem(error, store, userId);
    }
  });

  app.patch('/v1/integrations/notion/items/:pageId', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problem('invalid_request', { detail: 'Body must be JSON.' });
    }
    const record = body as { done?: unknown } | null;
    const done = record === null ? undefined : record.done;
    if (typeof done !== 'boolean') {
      return problem('invalid_request', {
        errors: [{ pointer: '/done', detail: 'done must be a boolean.' }],
      });
    }
    const open = await openConnection(store, userId, c.env);
    if (open === null || open.connection.dataSourceId === null) {
      return problem('provider_not_connected');
    }
    try {
      const dataSourceId = open.connection.dataSourceId;
      const pageId = c.req.param('pageId');
      const wrote = await withFreshToken(
        open,
        client(c.env),
        store,
        userId,
        c.env,
        async (token) => {
          const schema = await client(c.env).getDataSource(token, dataSourceId);
          const property = findCompletionProperty(schema);
          if (property === null) {
            return false;
          }
          await client(c.env).setCompletion(token, pageId, done, property);
          return true;
        }
      );
      if (!wrote) {
        return problem('provider_schema_unusable');
      }
    } catch (error) {
      return providerProblem(error, store, userId);
    }
    return c.body(null, 204);
  });

  app.delete('/v1/integrations/notion', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const open = await openConnection(store, userId, c.env);
    if (open === null) {
      return problem('provider_not_connected');
    }
    // Best-effort revocation: the user asked to disconnect, so our row goes either way. Failing
    // the request because Notion is unreachable would leave them unable to disconnect at all.
    try {
      await client(c.env).revokeToken(open.accessToken);
    } catch (error) {
      logger.error('Could not revoke the Notion grant upstream; removing our copy anyway', error);
    }
    await store.deleteProviderConnection(userId, PROVIDER);
    return c.body(null, 204);
  });
}
