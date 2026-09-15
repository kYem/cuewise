import { logger } from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256Base64Url,
  signState,
  verifyState,
} from '../crypto-utils';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import {
  NotionAuthError,
  type NotionClient,
  NotionConfigError,
  type NotionDataSource,
  type NotionGrant,
  NotionResourceError,
  NotionUnavailableError,
} from '../notion-client';
import { type CompletionProperty, completionWrite, findCompletionProperty } from '../notion-schema';
import { problem, type ValidationIssue } from '../problem-details';
import type { ProviderConnection, SealedGrant, SyncStore } from '../store';
import {
  CODE_CHALLENGE_RE,
  CODE_VERIFIER_RE,
  codeVerifierIssue,
  isAllowedReturnUri,
  requireStateSigningKey,
  respondWithDeepLink,
  toBounceState,
} from './bounce-shared';

const PROVIDER = 'notion';
const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
// Notion ids are UUIDs, dashed or not. Anything else is not an id, and would ride into an
// upstream URL path otherwise.
const NOTION_ID_RE =
  /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sanitized vocabulary for the deep link; nothing attacker-shaped rides back to the app. */
type ConnectOutcome = 'access_denied' | 'connect_failed' | 'server_error';

function returnWithCode(returnUri: string, code: string): Response {
  const target = new URL(returnUri);
  target.searchParams.set('code', code);
  return respondWithDeepLink(target, 'Notion is connected.');
}

function returnWithError(returnUri: string, outcome: ConnectOutcome): Response {
  const target = new URL(returnUri);
  target.searchParams.set('error', outcome);
  return respondWithDeepLink(target, "Connecting Notion didn't complete — return to Cuewise.");
}

interface OpenConnection {
  readonly connection: ProviderConnection;
  readonly accessToken: string;
  // The ciphertext the request is currently relying on. Renewal moves it, so a later auth
  // fault compares against the renewed value rather than the one the request started with.
  usedCiphertext: string;
}

/** null: no grant. A Response: the grant exists but cannot be opened, already answered. */
async function openConnection(
  store: SyncStore,
  userId: string,
  env: Env
): Promise<OpenConnection | Response | null> {
  const connection = await store.getProviderConnection(userId, PROVIDER);
  if (connection === null) {
    return null;
  }
  try {
    const accessToken = await decryptSecret(
      connection.ciphertext,
      connection.iv,
      env.PROVIDER_TOKEN_KEY
    );
    return { connection, accessToken, usedCiphertext: connection.ciphertext };
  } catch (error) {
    // A rotated PROVIDER_TOKEN_KEY. The row can never be read again, so it is as dead as a
    // revoked grant and gets the same answer — otherwise every read 500s until someone notices.
    logger.error('Stored Notion grant does not decrypt under the current key; dropping it', {
      userId,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    await store.deleteProviderConnection(userId, PROVIDER);
    return problem('provider_reauth_required');
  }
}

function isResponse(value: OpenConnection | Response | null): value is Response {
  return value instanceof Response;
}

async function sealGrant(grant: NotionGrant, key: string): Promise<SealedGrant> {
  const access = await encryptSecret(grant.accessToken, key);
  const refresh = grant.refreshToken === null ? null : await encryptSecret(grant.refreshToken, key);
  return {
    ciphertext: access.ciphertext,
    iv: access.iv,
    refreshCiphertext: refresh === null ? null : refresh.ciphertext,
    refreshIv: refresh === null ? null : refresh.iv,
    workspace: grant.workspace,
  };
}

/**
 * Renews once on an auth fault with the stored refresh token. Notion documents no expires_in,
 * so a 401 is the only signal a grant expired. Writes tokens only — never the whole row.
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
    let renewed: string;
    try {
      const refreshToken = await decryptSecret(
        refreshCiphertext,
        refreshIv,
        env.PROVIDER_TOKEN_KEY
      );
      const grant = await client.refreshGrant(refreshToken);
      const sealed = await sealGrant(grant, env.PROVIDER_TOKEN_KEY);
      const stored = await store.updateProviderTokens(userId, PROVIDER, sealed);
      if (!stored) {
        // The row vanished mid-request (a concurrent disconnect). The token just minted is
        // held by nobody; let it go rather than leave it live at Notion.
        await client.revokeToken(grant.accessToken).catch(() => undefined);
        throw new NotionAuthError('grant was removed during renewal');
      }
      open.usedCiphertext = sealed.ciphertext;
      renewed = grant.accessToken;
    } catch (renewalError) {
      // Named separately from the primary call's fault: an operator must be able to see that
      // renewal is what keeps failing.
      logger.warn('Notion grant renewal failed', {
        userId,
        reason: renewalError instanceof Error ? renewalError.message : 'unknown',
      });
      throw renewalError;
    }
    return attempt(renewed);
  }
}

/**
 * Maps a provider failure onto the error contract. An auth fault drops the grant, but only if the
 * row still holds the token this request used: a concurrent request may have renewed it, and
 * the loser of that race must not delete the winner's working grant.
 */
async function providerProblem(
  error: unknown,
  store: SyncStore,
  userId: string,
  usedCiphertext: string
): Promise<Response> {
  if (error instanceof NotionAuthError) {
    const current = await store.getProviderConnection(userId, PROVIDER);
    if (current !== null && current.ciphertext !== usedCiphertext) {
      logger.warn('Notion grant was renewed by a concurrent request; not dropping it', {
        userId,
        reason: error.message,
      });
      return problem('upstream_unavailable', { detail: 'Please retry.' });
    }
    logger.warn('Dropping the Notion grant after an auth fault', { userId, reason: error.message });
    await store.deleteProviderConnection(userId, PROVIDER);
    return problem('provider_reauth_required');
  }
  if (error instanceof NotionResourceError) {
    // The reason carries restricted_resource vs object_not_found — a capability we lack in
    // the developer portal looks identical to a deleted table without it.
    logger.warn('Notion resource unreachable', { userId, reason: error.message });
    return problem('provider_table_unavailable');
  }
  if (error instanceof NotionUnavailableError) {
    logger.warn('Notion upstream unavailable', { userId, reason: error.message });
    return problem('upstream_unavailable', { detail: error.message });
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

function invalidId(pointer: string): Response {
  return problem('invalid_request', {
    errors: [{ pointer, detail: 'must be a Notion id (a UUID, with or without dashes).' }],
  });
}

export function registerNotionRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  function client(env: Env): NotionClient {
    return deps.notionClientFactory(env);
  }

  // Answers JSON rather than a 302 so the app opens the URL itself. The state carries no
  // identity: whose account the grant lands in is decided at /claim, by a session.
  app.get('/v1/integrations/notion/start', async (c) => {
    const returnUri = c.req.query('return_uri') ?? '';
    const codeChallenge = c.req.query('code_challenge') ?? '';
    const issues: ValidationIssue[] = [];
    if (!isAllowedReturnUri(returnUri, c.env)) {
      issues.push({ pointer: '/return_uri', detail: 'return_uri is not allowlisted.' });
    }
    if (!CODE_CHALLENGE_RE.test(codeChallenge)) {
      issues.push({
        pointer: '/code_challenge',
        detail: 'code_challenge must be exactly 43 base64url characters.',
      });
    }
    if (issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null || !credentialsConfigured(c.env)) {
      return problem('internal');
    }
    const state = await signState({ returnUri, codeChallenge, nonce: randomToken() }, signingKey);
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

  // Unauthenticated by necessity: Notion redirects a browser here. It never stores the grant
  // against an account — it parks it behind a one-time PKCE-bound code that rides the deep link
  // to whichever device authorised, and that device's session claims it.
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
    const state = toBounceState(verified.payload);
    // Re-checked, not trusted from the state: the allowlist may have tightened since it was minted.
    if (state === null || !isAllowedReturnUri(state.returnUri, c.env)) {
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    const denied = c.req.query('error');
    if (denied !== undefined) {
      if (denied === 'access_denied') {
        return returnWithError(state.returnUri, 'access_denied');
      }
      // temporarily_unavailable / server_error are Notion's outage codes; anything else is a
      // fault in our authorize URL or integration config. Neither is a user cancel.
      if (denied === 'temporarily_unavailable' || denied === 'server_error') {
        logger.warn('Notion authorize step unavailable', { error: denied });
      } else {
        logger.error('Notion authorize step failed', { error: denied });
      }
      return returnWithError(state.returnUri, 'server_error');
    }
    const code = c.req.query('code') ?? '';
    if (code === '' || !credentialsConfigured(c.env)) {
      return returnWithError(state.returnUri, 'server_error');
    }
    let grant: NotionGrant | null = null;
    try {
      grant = await client(c.env).exchangeCode(code);
      const sealed = await sealGrant(grant, c.env.PROVIDER_TOKEN_KEY);
      const oneTime = await deps
        .storeFactory(c.env.DB)
        .mintAuthCode({ provider: PROVIDER, grant: sealed }, state.codeChallenge);
      return returnWithCode(state.returnUri, oneTime);
    } catch (error) {
      if (grant !== null) {
        // Exchanged but never parked: nobody holds this token, so do not leave it live.
        await client(c.env)
          .revokeToken(grant.accessToken)
          .catch(() => undefined);
      }
      if (error instanceof NotionConfigError) {
        logger.error('Notion rejected our client configuration', error);
        return returnWithError(state.returnUri, 'server_error');
      }
      logger.error('Notion connect failed', error);
      return returnWithError(state.returnUri, 'connect_failed');
    }
  });

  // The step that binds a grant to an account. Only a session can call it, and only with the
  // verifier whose challenge the state carried — so a grant lands where it was authorised.
  app.post('/v1/integrations/notion/claim', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const body = await parseJsonBody(c);
    if (body instanceof Response) {
      return body;
    }
    const record = body as { code?: unknown; codeVerifier?: unknown } | null;
    const code = record === null ? undefined : record.code;
    const codeVerifier = record === null ? undefined : record.codeVerifier;
    const issues: ValidationIssue[] = [];
    if (typeof code !== 'string' || code === '') {
      issues.push({ pointer: '/code', detail: 'required non-empty string' });
    }
    if (typeof codeVerifier !== 'string' || !CODE_VERIFIER_RE.test(codeVerifier)) {
      issues.push(codeVerifierIssue(codeVerifier));
    }
    if (issues.length > 0 || typeof code !== 'string' || typeof codeVerifier !== 'string') {
      return problem('invalid_request', { errors: issues });
    }
    const consumed = await store.consumeAuthCode(code);
    if (consumed === null) {
      logger.warn('Notion claim with an unknown, expired, or already-used code', { userId });
      return problem('invalid_token');
    }
    // Burned before verifying, like the sign-in bounces: a wrong verifier kills the code.
    if ((await sha256Base64Url(codeVerifier)) !== consumed.codeChallenge) {
      logger.warn('Notion claim failed the PKCE verifier check', { userId });
      return problem('invalid_token');
    }
    if (consumed.payload.provider !== PROVIDER) {
      logger.warn('Notion claim presented a sign-in code', { userId });
      return problem('invalid_token');
    }
    const grant = consumed.payload.grant;
    try {
      // Keeps an already-chosen table: sharing one more page must not un-pick it.
      await store.putProviderGrant(userId, PROVIDER, grant);
    } catch (error) {
      // The code is already burned, so this grant can never be claimed again. Revoke it rather
      // than leave a live token nobody holds, and say so — a retry will only see invalid_token.
      logger.error('Notion grant lost after its claim code was consumed', error, { userId });
      const accessToken = await decryptSecret(grant.ciphertext, grant.iv, c.env.PROVIDER_TOKEN_KEY);
      await client(c.env)
        .revokeToken(accessToken)
        .catch(() => undefined);
      return problem('internal', { detail: 'The connection was not saved; please connect again.' });
    }
    return c.json({ workspace: grant.workspace });
  });

  app.get('/v1/integrations/notion/tables', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const open = await openConnection(store, userId, c.env);
    if (isResponse(open)) {
      return open;
    }
    if (open === null) {
      return problem('provider_not_connected');
    }
    let tables: NotionDataSource[];
    try {
      tables = await withFreshToken(open, client(c.env), store, userId, c.env, (token) =>
        client(c.env).searchDataSources(token)
      );
    } catch (error) {
      return providerProblem(error, store, userId, open.usedCiphertext);
    }
    return c.json({ workspace: open.connection.workspace, tables });
  });

  app.put('/v1/integrations/notion/selection', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const body = await parseJsonBody(c);
    if (body instanceof Response) {
      return body;
    }
    const record = body as { dataSourceId?: unknown } | null;
    const dataSourceId = record === null ? undefined : record.dataSourceId;
    if (typeof dataSourceId !== 'string' || !NOTION_ID_RE.test(dataSourceId)) {
      return invalidId('/dataSourceId');
    }
    const open = await openConnection(store, userId, c.env);
    if (isResponse(open)) {
      return open;
    }
    if (open === null) {
      return problem('provider_not_connected');
    }
    let property: CompletionProperty | null;
    try {
      const schema = await withFreshToken(open, client(c.env), store, userId, c.env, (token) =>
        client(c.env).getPropertySchemas(token, dataSourceId)
      );
      property = findCompletionProperty(schema);
    } catch (error) {
      return providerProblem(error, store, userId, open.usedCiphertext);
    }
    if (property === null) {
      return problem('provider_schema_unusable');
    }
    const stored = await store.setProviderDataSource(userId, PROVIDER, dataSourceId);
    if (!stored) {
      return problem('provider_not_connected');
    }
    return c.json({ dataSourceId, completion: property.kind });
  });

  app.get('/v1/integrations/notion/items', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const open = await openConnection(store, userId, c.env);
    if (isResponse(open)) {
      return open;
    }
    if (open === null) {
      return problem('provider_not_connected');
    }
    const dataSourceId = open.connection.dataSourceId;
    if (dataSourceId === null) {
      return problem('provider_table_unselected');
    }
    try {
      // Re-read every time: a renamed property must surface as a prompt, not as an empty list.
      const result = await withFreshToken(
        open,
        client(c.env),
        store,
        userId,
        c.env,
        async (token) => {
          const schema = await client(c.env).getPropertySchemas(token, dataSourceId);
          const property = findCompletionProperty(schema);
          if (property === null) {
            return null;
          }
          return client(c.env).queryRows(token, dataSourceId, property);
        }
      );
      if (result === null) {
        return problem('provider_schema_unusable');
      }
      return c.json({
        workspace: open.connection.workspace,
        items: result.items,
        truncated: result.truncated,
      });
    } catch (error) {
      return providerProblem(error, store, userId, open.usedCiphertext);
    }
  });

  app.patch('/v1/integrations/notion/items/:pageId', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const pageId = c.req.param('pageId');
    if (!NOTION_ID_RE.test(pageId)) {
      return invalidId('/pageId');
    }
    const body = await parseJsonBody(c);
    if (body instanceof Response) {
      return body;
    }
    const record = body as { done?: unknown } | null;
    const done = record === null ? undefined : record.done;
    if (typeof done !== 'boolean') {
      return problem('invalid_request', {
        errors: [{ pointer: '/done', detail: 'done must be a boolean.' }],
      });
    }
    const open = await openConnection(store, userId, c.env);
    if (isResponse(open)) {
      return open;
    }
    if (open === null) {
      return problem('provider_not_connected');
    }
    const dataSourceId = open.connection.dataSourceId;
    if (dataSourceId === null) {
      return problem('provider_table_unselected');
    }
    try {
      const outcome = await withFreshToken(
        open,
        client(c.env),
        store,
        userId,
        c.env,
        async (token): Promise<'written' | 'unusable' | 'page_gone'> => {
          const schema = await client(c.env).getPropertySchemas(token, dataSourceId);
          const property = findCompletionProperty(schema);
          if (property === null) {
            return 'unusable';
          }
          // A status table with no To-do group cannot express "not done" — a schema condition
          // the user can fix, so it is refused rather than written as a cleared status.
          const write = completionWrite(property, done);
          if (write === null) {
            return 'unusable';
          }
          try {
            await client(c.env).setCompletion(token, pageId, write);
          } catch (error) {
            // A 403/404 on the PAGE means that row is gone or un-shared — not the table. Sending
            // the user back to the picker for a task someone just deleted would un-pick a good table.
            if (error instanceof NotionResourceError) {
              return 'page_gone';
            }
            throw error;
          }
          return 'written';
        }
      );
      if (outcome === 'unusable') {
        return problem('provider_schema_unusable');
      }
      if (outcome === 'page_gone') {
        return problem('not_found', { detail: 'That task no longer exists in Notion.' });
      }
    } catch (error) {
      return providerProblem(error, store, userId, open.usedCiphertext);
    }
    return c.body(null, 204);
  });

  // Never blocked on the token: removing a stored credential must work even when the key that
  // sealed it has rotated. Upstream revocation is best-effort for the same reason.
  app.delete('/v1/integrations/notion', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const existing = await store.getProviderConnection(userId, PROVIDER);
    if (existing === null) {
      return problem('provider_not_connected');
    }
    try {
      const accessToken = await decryptSecret(
        existing.ciphertext,
        existing.iv,
        c.env.PROVIDER_TOKEN_KEY
      );
      await client(c.env).revokeToken(accessToken);
    } catch (error) {
      if (error instanceof NotionConfigError) {
        // Our secret is wrong, so revocation fails for every user — systemic, must be loud.
        logger.error('Notion revocation is failing on our client configuration', error);
      } else {
        logger.warn('Could not revoke the Notion grant upstream; removing our copy anyway', {
          userId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    await store.deleteProviderConnection(userId, PROVIDER);
    return c.body(null, 204);
  });
}
