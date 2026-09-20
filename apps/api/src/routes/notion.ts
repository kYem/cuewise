import { logger } from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import {
  decryptSecret,
  encryptSecret,
  isSecretKey,
  randomToken,
  sha256Base64Url,
  signState,
  verifyState,
} from '../crypto-utils';
import type { Env } from '../env';
import { ERROR_CODE_RE, parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import {
  NotionAuthError,
  type NotionClient,
  NotionConfigError,
  type NotionGrant,
  NotionResourceError,
  NotionUnavailableError,
} from '../notion-client';
import { completionWrite, findCompletionProperty } from '../notion-schema';
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

type SealedSecret = Pick<SealedGrant, 'ciphertext' | 'iv'>;

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

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

// `name`, not `message`, for decrypt failures: WebCrypto's message is runtime-authored and not
// guaranteed secret-free, and the class already says which step failed.
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

// Shape only: a well-formed wrong key still passes and fails at decrypt. Checked up front so a
// truncated secret reads as our fault, never as a revoked grant.
function requireProviderTokenKey(env: Env): string | null {
  if (!isSecretKey(env.PROVIDER_TOKEN_KEY)) {
    logger.error('PROVIDER_TOKEN_KEY is missing or does not decode to 32 bytes');
    return null;
  }
  return env.PROVIDER_TOKEN_KEY;
}

function credentialsConfigured(env: Env): boolean {
  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
    logger.error('Notion integration credentials are not configured');
    return false;
  }
  return requireProviderTokenKey(env) !== null;
}

/** Best-effort and never throws, so no cleanup path can be trapped by Notion being down. */
async function revokeUpstream(
  client: NotionClient,
  accessToken: string,
  userId: string | null
): Promise<void> {
  try {
    await client.revokeToken(accessToken);
  } catch (error) {
    if (
      error instanceof NotionAuthError ||
      error instanceof NotionUnavailableError ||
      error instanceof NotionResourceError
    ) {
      logger.warn('Could not revoke a Notion grant upstream', { userId, reason: reasonOf(error) });
      return;
    }
    // Our config, or our bug: fails for every user, so it must be loud.
    logger.error('Notion revocation failed on our side', error, { userId });
  }
}

/** `revokeUpstream` for a stored grant; one that cannot be opened is logged and skipped. */
async function revokeSealed(
  client: NotionClient,
  sealed: SealedSecret,
  env: Env,
  userId: string
): Promise<void> {
  const key = env.PROVIDER_TOKEN_KEY;
  if (!isSecretKey(key)) {
    // Notion tokens never expire on their own, so this one stays live until someone notices.
    logger.error('PROVIDER_TOKEN_KEY is malformed; skipping upstream Notion revocation', {
      userId,
    });
    return;
  }
  let accessToken: string;
  try {
    accessToken = await decryptSecret(sealed.ciphertext, sealed.iv, key);
  } catch (error) {
    logger.warn('Could not decrypt a Notion grant to revoke it upstream', {
      userId,
      reason: errorName(error),
    });
    return;
  }
  await revokeUpstream(client, accessToken, userId);
}

/** For account deletion: the row goes with the user, but Notion should forget the grant too. */
export async function revokeNotionGrant(
  store: SyncStore,
  client: NotionClient,
  env: Env,
  userId: string
): Promise<void> {
  const existing = await store.getProviderConnection(userId, PROVIDER);
  if (existing === null) {
    return;
  }
  await revokeSealed(client, existing, env, userId);
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

interface OpenGrant {
  readonly store: SyncStore;
  readonly client: NotionClient;
  readonly userId: string;
  readonly key: string;
  readonly connection: ProviderConnection;
  readonly accessToken: string;
}

// Nothing is deleted on a decrypt failure: a rotated or mis-deployed key makes every grant
// unreadable at once, and putting it back must find them all. A reconnect replaces the row anyway.
async function openGrant(
  store: SyncStore,
  client: NotionClient,
  env: Env,
  userId: string
): Promise<OpenGrant | Response> {
  const key = requireProviderTokenKey(env);
  if (key === null) {
    return problem('internal');
  }
  const connection = await store.getProviderConnection(userId, PROVIDER);
  if (connection === null) {
    return problem('provider_not_connected');
  }
  let accessToken: string;
  try {
    accessToken = await decryptSecret(connection.ciphertext, connection.iv, key);
  } catch (error) {
    logger.error('Stored Notion grant does not decrypt under the current key', {
      userId,
      reason: errorName(error),
    });
    return problem('provider_reauth_required');
  }
  return { store, client, userId, key, connection, accessToken };
}

/**
 * Maps a provider failure onto the error contract. An auth fault drops the grant, but only if the
 * row still holds the token this request used: a concurrent request may have renewed it, and
 * the loser of that race must not delete the winner's working grant.
 */
async function providerProblem(
  error: unknown,
  open: OpenGrant,
  usedCiphertext: string
): Promise<Response> {
  const { store, userId } = open;
  if (error instanceof NotionAuthError) {
    const current = await store.getProviderConnection(userId, PROVIDER);
    if (current === null) {
      // Disconnected mid-request: nothing to drop, and "reconnect" would be the wrong prompt.
      return problem('provider_not_connected');
    }
    if (current.ciphertext !== usedCiphertext) {
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
    // Our credentials or our request, not the user's grant — nothing they can do, so it must be loud.
    logger.error('Notion rejected our client or request', error);
    return problem('internal');
  }
  throw error;
}

interface RenewedGrant {
  readonly accessToken: string;
  readonly ciphertext: string;
}

// Named by role so the access pair (bare `ciphertext`/`iv`) cannot be handed in as the refresh one.
interface RefreshPair {
  readonly refreshCiphertext: string;
  readonly refreshIv: string;
}

/** Trades the stored refresh token for a new grant and persists it — tokens only, never the row. */
async function renewGrant(open: OpenGrant, refresh: RefreshPair): Promise<RenewedGrant | Response> {
  const { userId, client, store } = open;
  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(refresh.refreshCiphertext, refresh.refreshIv, open.key);
  } catch (error) {
    // The access token opened under this key moments ago, so the row is inconsistent and will stay
    // so: only a reconnect fixes it, and 500s would never prompt one.
    logger.error('Stored Notion refresh token does not decrypt under the current key', {
      userId,
      reason: errorName(error),
    });
    return problem('provider_reauth_required');
  }
  let grant: NotionGrant | null = null;
  let sealed: SealedGrant;
  try {
    grant = await client.refreshGrant(refreshToken);
    sealed = await sealGrant(grant, open.key);
  } catch (error) {
    if (grant !== null) {
      // Minted but never stored: nobody holds this token, so do not leave it live.
      await revokeUpstream(client, grant.accessToken, userId);
    }
    // Named separately from the primary call's fault: an operator must be able to see that
    // renewal is what keeps failing.
    logger.warn('Notion grant renewal failed', { userId, reason: reasonOf(error) });
    return providerProblem(error, open, open.connection.ciphertext);
  }
  const { ciphertext, iv, refreshCiphertext, refreshIv } = sealed;
  let stored: boolean;
  try {
    stored = await store.updateProviderTokens(userId, PROVIDER, {
      ciphertext,
      iv,
      refreshCiphertext,
      refreshIv,
    });
  } catch (error) {
    await revokeUpstream(client, grant.accessToken, userId);
    logger.error('Notion renewal could not be stored; revoked the new token', error, { userId });
    throw error;
  }
  if (!stored) {
    // Disconnected mid-request. Same orphan, different cause.
    await revokeUpstream(client, grant.accessToken, userId);
    return problem('provider_not_connected');
  }
  return { accessToken: grant.accessToken, ciphertext };
}

function refreshPair(connection: ProviderConnection): RefreshPair | null {
  if (connection.refreshCiphertext === null || connection.refreshIv === null) {
    return null;
  }
  return { refreshCiphertext: connection.refreshCiphertext, refreshIv: connection.refreshIv };
}

/**
 * Runs one Notion call, renewing the grant once on an auth fault when a refresh token is held
 * (Notion documents no expires_in, so a 401 is the only signal a grant expired). Every provider
 * failure is answered here; anything else propagates to onError as a 500.
 */
async function withFreshToken<T>(
  open: OpenGrant,
  attempt: (accessToken: string) => Promise<T>
): Promise<T | Response> {
  let renewed: RenewedGrant;
  try {
    return await attempt(open.accessToken);
  } catch (error) {
    const refresh = refreshPair(open.connection);
    if (!(error instanceof NotionAuthError) || refresh === null) {
      return providerProblem(error, open, open.connection.ciphertext);
    }
    const outcome = await renewGrant(open, refresh);
    if (outcome instanceof Response) {
      return outcome;
    }
    renewed = outcome;
  }
  try {
    return await attempt(renewed.accessToken);
  } catch (error) {
    return providerProblem(error, open, renewed.ciphertext);
  }
}

function invalidId(pointer: string): Response {
  return problem('invalid_request', {
    errors: [{ pointer, detail: 'must be a Notion id (a UUID, with or without dashes).' }],
  });
}

type WriteOutcome = 'written' | 'unusable' | 'no_todo_group' | 'page_gone';

export function registerNotionRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  function client(env: Env): NotionClient {
    return deps.notionClientFactory(env);
  }

  function open(env: Env, userId: string): Promise<OpenGrant | Response> {
    return openGrant(deps.storeFactory(env.DB), client(env), env, userId);
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
        logger.error('Notion authorize step failed', {
          error: ERROR_CODE_RE.test(denied) ? denied : 'unrecognised',
        });
      }
      return returnWithError(state.returnUri, 'server_error');
    }
    const code = c.req.query('code') ?? '';
    if (code === '') {
      logger.warn('Notion callback carried neither a code nor an error');
      return returnWithError(state.returnUri, 'server_error');
    }
    if (!credentialsConfigured(c.env)) {
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
        await revokeUpstream(client(c.env), grant.accessToken, null);
      }
      if (error instanceof NotionConfigError) {
        logger.error('Notion rejected our client or request', error);
        return returnWithError(state.returnUri, 'server_error');
      }
      if (error instanceof NotionAuthError || error instanceof NotionUnavailableError) {
        // A code Notion would not exchange, or Notion being down — neither is a fault of ours.
        logger.warn('Notion connect did not complete', { reason: error.message });
        return returnWithError(state.returnUri, 'connect_failed');
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
      await revokeSealed(client(c.env), grant, c.env, userId);
      return problem('internal', { detail: 'The connection was not saved; please connect again.' });
    }
    return c.json({ workspace: grant.workspace });
  });

  app.get('/v1/integrations/notion/tables', async (c) => {
    const grant = await open(c.env, c.get('userId'));
    if (grant instanceof Response) {
      return grant;
    }
    const tables = await withFreshToken(grant, (token) => grant.client.searchDataSources(token));
    if (tables instanceof Response) {
      return tables;
    }
    return c.json({ workspace: grant.connection.workspace, tables });
  });

  app.put('/v1/integrations/notion/selection', async (c) => {
    const body = await parseJsonBody(c);
    if (body instanceof Response) {
      return body;
    }
    const record = body as { dataSourceId?: unknown } | null;
    const dataSourceId = record === null ? undefined : record.dataSourceId;
    if (typeof dataSourceId !== 'string' || !NOTION_ID_RE.test(dataSourceId)) {
      return invalidId('/dataSourceId');
    }
    const grant = await open(c.env, c.get('userId'));
    if (grant instanceof Response) {
      return grant;
    }
    const schema = await withFreshToken(grant, (token) =>
      grant.client.getPropertySchemas(token, dataSourceId)
    );
    if (schema instanceof Response) {
      return schema;
    }
    const property = findCompletionProperty(schema);
    if (property === null) {
      return problem('provider_schema_unusable');
    }
    const stored = await grant.store.setProviderDataSource(grant.userId, PROVIDER, dataSourceId);
    if (!stored) {
      return problem('provider_not_connected');
    }
    return c.json({ dataSourceId, completion: property.kind });
  });

  app.get('/v1/integrations/notion/items', async (c) => {
    const grant = await open(c.env, c.get('userId'));
    if (grant instanceof Response) {
      return grant;
    }
    const dataSourceId = grant.connection.dataSourceId;
    if (dataSourceId === null) {
      return problem('provider_table_unselected');
    }
    // Re-read every time: a renamed property must surface as a prompt, not as an empty list.
    const result = await withFreshToken(grant, async (token) => {
      const schema = await grant.client.getPropertySchemas(token, dataSourceId);
      const property = findCompletionProperty(schema);
      if (property === null) {
        return null;
      }
      return grant.client.queryRows(token, dataSourceId, property);
    });
    if (result instanceof Response) {
      return result;
    }
    if (result === null) {
      return problem('provider_schema_unusable');
    }
    return c.json({
      workspace: grant.connection.workspace,
      items: result.items,
      truncated: result.truncated,
    });
  });

  app.patch('/v1/integrations/notion/items/:pageId', async (c) => {
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
    const grant = await open(c.env, c.get('userId'));
    if (grant instanceof Response) {
      return grant;
    }
    const dataSourceId = grant.connection.dataSourceId;
    if (dataSourceId === null) {
      return problem('provider_table_unselected');
    }
    const outcome = await withFreshToken(grant, async (token): Promise<WriteOutcome> => {
      const schema = await grant.client.getPropertySchemas(token, dataSourceId);
      const property = findCompletionProperty(schema);
      if (property === null) {
        return 'unusable';
      }
      // Refused rather than written as a cleared status: a schema condition the user can fix.
      const write = completionWrite(property, done);
      if (write === null) {
        return 'no_todo_group';
      }
      try {
        await grant.client.setCompletion(token, pageId, write);
      } catch (error) {
        // A 403/404 on the PAGE means that row is gone or un-shared — not the table. Sending
        // the user back to the picker for a task someone just deleted would un-pick a good table.
        if (error instanceof NotionResourceError) {
          return 'page_gone';
        }
        throw error;
      }
      return 'written';
    });
    if (outcome instanceof Response) {
      return outcome;
    }
    if (outcome === 'unusable') {
      return problem('provider_schema_unusable');
    }
    if (outcome === 'no_todo_group') {
      return problem('provider_todo_group_missing');
    }
    if (outcome === 'page_gone') {
      return problem('not_found', { detail: 'That task no longer exists in Notion.' });
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
    await revokeSealed(client(c.env), existing, c.env, userId);
    await store.deleteProviderConnection(userId, PROVIDER);
    return c.body(null, 204);
  });
}
