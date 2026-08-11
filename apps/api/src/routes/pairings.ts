import type {
  PairingCommitment,
  PairingNonceB64,
  PairingPublicKeyB64,
  PeerWrappedEnvelope,
} from '@cuewise/crypto';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import { problem, requireNonEmptyString, type ValidationIssue } from '../problem-details';

// Bounds the commitment, publicKey, and nonce fields alike: all are ~32-43 byte b64url values.
const MAX_KEY_MATERIAL_BYTES = 64;
const MAX_ENVELOPE_BYTES = 1024; // same bound as /v1/keys/recovery
const NO_SUCH_PAIRING = 'No such pairing request for this account.';

// Each key-material brand below is asserted here and nowhere else: this is where an untrusted wire
// string becomes typed material, and the validator beside it is all the server ever knows about it.
export function registerPairingsRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.post('/v1/pairings', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    // `raw` can be JSON `null`, which is typeof 'object' — guard before reading `.commitment`.
    if (raw === null || typeof raw !== 'object') {
      return problem('invalid_request');
    }
    const commitment = (raw as { commitment?: unknown }).commitment;
    const issues: ValidationIssue[] = [];
    requireNonEmptyString(commitment, '/commitment', issues, { maxLength: MAX_KEY_MATERIAL_BYTES });
    if (typeof commitment !== 'string' || issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const store = deps.storeFactory(c.env.DB);
    const created = await store.createPairing(
      c.get('userId'),
      c.get('tokenHash'),
      commitment as PairingCommitment,
      Date.now()
    );
    return c.json(created);
  });

  app.get('/v1/pairings', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const pairings = await store.listPendingPairings(
      c.get('userId'),
      c.get('tokenHash'),
      Date.now()
    );
    return c.json({ pairings });
  });

  app.get('/v1/pairings/:id', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const found = await store.getPairingForRequester(
      c.get('userId'),
      c.req.param('id'),
      Date.now()
    );
    if (!found) {
      return problem('pairing_not_found', { detail: NO_SUCH_PAIRING });
    }
    return c.json(found);
  });

  app.post('/v1/pairings/:id/commit', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    if (raw === null || typeof raw !== 'object') {
      return problem('invalid_request');
    }
    const publicKey = (raw as { publicKey?: unknown }).publicKey;
    const issues: ValidationIssue[] = [];
    requireNonEmptyString(publicKey, '/publicKey', issues, { maxLength: MAX_KEY_MATERIAL_BYTES });
    if (typeof publicKey !== 'string' || issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const store = deps.storeFactory(c.env.DB);
    const result = await store.commitPairing(
      c.get('userId'),
      c.req.param('id'),
      c.get('tokenHash'),
      publicKey as PairingPublicKeyB64,
      Date.now()
    );
    if (result === 'not_found') {
      return problem('pairing_not_found', { detail: NO_SUCH_PAIRING });
    }
    if (result === 'conflict') {
      return problem('pairing_conflict');
    }
    return c.body(null, 204);
  });

  app.put('/v1/pairings/:id/reveal', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    if (raw === null || typeof raw !== 'object') {
      return problem('invalid_request');
    }
    const publicKey = (raw as { publicKey?: unknown }).publicKey;
    const nonce = (raw as { nonce?: unknown }).nonce;
    const issues: ValidationIssue[] = [];
    requireNonEmptyString(publicKey, '/publicKey', issues, { maxLength: MAX_KEY_MATERIAL_BYTES });
    requireNonEmptyString(nonce, '/nonce', issues, { maxLength: MAX_KEY_MATERIAL_BYTES });
    if (typeof publicKey !== 'string' || typeof nonce !== 'string' || issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const store = deps.storeFactory(c.env.DB);
    const result = await store.revealPairing(
      c.get('userId'),
      c.req.param('id'),
      c.get('tokenHash'),
      publicKey as PairingPublicKeyB64,
      nonce as PairingNonceB64,
      Date.now()
    );
    if (result === 'not_found') {
      return problem('pairing_not_found', { detail: NO_SUCH_PAIRING });
    }
    if (result === 'conflict') {
      return problem('pairing_conflict');
    }
    return c.body(null, 204);
  });

  app.put('/v1/pairings/:id/envelope', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    if (raw === null || typeof raw !== 'object') {
      return problem('invalid_request');
    }
    const envelope = (raw as { envelope?: unknown }).envelope;
    const issues: ValidationIssue[] = [];
    requireNonEmptyString(envelope, '/envelope', issues, { maxLength: MAX_ENVELOPE_BYTES });
    if (typeof envelope !== 'string' || issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const store = deps.storeFactory(c.env.DB);
    const result = await store.putPairingEnvelope(
      c.get('userId'),
      c.req.param('id'),
      c.get('tokenHash'),
      envelope as PeerWrappedEnvelope,
      Date.now()
    );
    if (result === 'not_found') {
      return problem('pairing_not_found', { detail: NO_SUCH_PAIRING });
    }
    if (result === 'conflict') {
      return problem('pairing_conflict');
    }
    return c.body(null, 204);
  });

  app.delete('/v1/pairings/:id', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const found = await store.deletePairing(c.get('userId'), c.req.param('id'));
    if (!found) {
      return problem('pairing_not_found', { detail: NO_SUCH_PAIRING });
    }
    return c.body(null, 204);
  });
}
