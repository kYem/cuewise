import { logger } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import {
  RecoveryCodeError,
  RecoveryCodeRequiredError,
  type SyncEngineControlSurface,
  type SyncSignInProvider,
} from '@cuewise/sync-engine';
import type {
  SyncControlAnyResponse,
  SyncControlMessage,
  SyncControlResponse,
  SyncDetailsResponse,
} from './sync-control-messages';

export interface SyncControlDeps {
  /** Reads and clears the one-shot recovery-code capture slot owned by background.ts. */
  takeRecoveryCode: () => string | undefined;
}

// Builds the response from the thrown error AND the post-call status — a 401 during
// initial sync sets signed_out and returns rather than throws (mirrors macOS's error map).
async function doEnable(
  engine: SyncEngineControlSurface,
  provider: SyncSignInProvider,
  credential: string,
  deviceName: string,
  recoveryCode: string | undefined,
  deps: SyncControlDeps
): Promise<SyncControlResponse> {
  deps.takeRecoveryCode(); // drain any stale value before this attempt
  try {
    await engine.enableSync(provider, credential, deviceName, { recoveryCode });
  } catch (err) {
    if (err instanceof RecoveryCodeRequiredError) {
      return { ok: false, reason: 'needs-code' };
    }
    if (err instanceof RecoveryCodeError) {
      return { ok: false, reason: 'bad-code', detail: err.kind };
    }
    if (err instanceof ApiError && err.status === 401) {
      return { ok: false, reason: 'auth' };
    }
    const detail = err instanceof Error ? err.message : String(err);
    // Put the cause in the message text so it survives string-coercing surfaces (Chrome's Errors
    // panel); the Error arg still carries the stack in the console. Metadata only, never the token.
    logger.error(`Cloud sync enable failed: ${detail}`, err);
    return { ok: false, reason: 'error', detail };
  }
  if (engine.getStatus() === 'signed_out') {
    return { ok: false, reason: 'auth' };
  }
  return { ok: true, recoveryCode: deps.takeRecoveryCode() };
}

/** Read-only details lookup — deliberately NOT serialized (see handleSyncControlMessage). */
async function runDetails(engine: SyncEngineControlSurface): Promise<SyncDetailsResponse> {
  // Informational for the settings UI; engine.getAccount never throws (null on any failure).
  const account = await engine.getAccount();
  if (account === null) {
    return { ok: true, details: null };
  }
  return {
    ok: true,
    details: {
      accountEmail: account.email,
      accountId: account.userId,
      lastSyncedAt: engine.getLastSyncedAt(),
    },
  };
}

async function runOp(
  engine: SyncEngineControlSurface,
  msg: SyncControlMessage & { op: Exclude<SyncControlMessage['op'], 'details'> },
  deps: SyncControlDeps
): Promise<SyncControlResponse> {
  if (msg.op === 'enable') {
    // Runtime guard (the wire is untyped): reject an unknown provider or an empty credential/
    // device name, not just `undefined`. Log so a caller regression isn't a bare, detail-less error.
    if (
      (msg.provider !== 'dev' && msg.provider !== 'google') ||
      !msg.credential ||
      !msg.deviceName
    ) {
      logger.error(
        `Cloud sync enable rejected: malformed control message (provider=${msg.provider})`
      );
      return { ok: false, reason: 'error' };
    }
    return doEnable(engine, msg.provider, msg.credential, msg.deviceName, msg.recoveryCode, deps);
  }
  // Reconnect stays dev-only (Google reconnect is a follow-up); the bridge already resolves
  // persisted creds into accountId/deviceName — no code = silent re-auth, a code enrolls.
  if (msg.op === 'reconnect') {
    if (!msg.accountId || !msg.deviceName) {
      logger.error('Cloud sync reconnect rejected: malformed control message');
      return { ok: false, reason: 'error' };
    }
    return doEnable(engine, 'dev', msg.accountId, msg.deviceName, msg.recoveryCode, deps);
  }
  // disable/regenerate/syncNow have no enroll control-flow — a throw is a plain error result.
  try {
    switch (msg.op) {
      case 'disable':
        await engine.disableSync();
        return { ok: true };
      case 'regenerate':
        return { ok: true, recoveryCode: await engine.regenerateRecoveryCode() };
      case 'syncNow':
        await engine.syncNow();
        return { ok: true };
      default: {
        // Exhaustiveness: a new SYNC_CONTROL_OPS entry is a compile error here — never a
        // silent fallthrough into some other operation.
        const exhaustive: never = msg.op;
        logger.error(`Cloud sync control op '${String(exhaustive)}' has no handler`);
        return { ok: false, reason: 'error' };
      }
    }
  } catch (err) {
    logger.error(`Cloud sync control op '${msg.op}' failed`, err);
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : undefined };
  }
}

// Promise-chain mutex: every op is serialized per SW so two concurrent ops (chiefly
// enable/reconnect, which share the one-shot capture slot) never interleave.
let mutex: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Runs a page-relayed sync-control message (ENG-45 option B) against the background's
 * SyncEngine and returns the response to send back over chrome.runtime messaging.
 */
export async function handleSyncControlMessage(
  engine: SyncEngineControlSurface,
  msg: SyncControlMessage,
  deps: SyncControlDeps
): Promise<SyncControlAnyResponse> {
  const { op } = msg;
  if (op === 'details') {
    // Read-only and side-effect-free — bypasses the mutex so a slow account fetch can never
    // delay a queued user action (e.g. a disable click) behind it.
    return runDetails(engine);
  }
  return serialize(() => runOp(engine, { ...msg, op }, deps));
}
