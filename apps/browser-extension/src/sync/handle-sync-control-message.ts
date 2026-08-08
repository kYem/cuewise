import { buildSyncDetails } from '@cuewise/app';
import { describeThrown, logger } from '@cuewise/shared';
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
  SyncLastCycleResponse,
  SyncOutcomeResponse,
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
    // Drained once, for every arm below. enableSync hands a minted code over before the steps that
    // can throw, and the account it opens outlives the attempt — so a failure that swallows it
    // locks the user out. Attaching it here is what stops the next arm forgetting.
    return { ...enableFailure(err), recoveryCode: deps.takeRecoveryCode() };
  }
  if (engine.getStatus() === 'signed_out') {
    return { ok: false, reason: 'auth' };
  }
  if (engine.getStatus() === 'disabled') {
    // enableSync returned without activating, so a disable landed inside it: ok here would
    // persist creds and hand Chrome sync off. A code it minted still has to reach the user.
    return { ok: false, reason: 'cancelled', recoveryCode: deps.takeRecoveryCode() };
  }
  return { ok: true, recoveryCode: deps.takeRecoveryCode() };
}

/** Why an enable threw. Never carries the code — runEnable attaches that to every arm at once. */
function enableFailure(err: unknown): Extract<SyncControlResponse, { ok: false }> {
  if (err instanceof RecoveryCodeRequiredError) {
    return { ok: false, reason: 'needs-code' };
  }
  if (err instanceof RecoveryCodeError) {
    return { ok: false, reason: 'bad-code', detail: err.kind };
  }
  if (err instanceof ApiError && err.status === 401) {
    return { ok: false, reason: 'auth' };
  }
  const detail = describeThrown(err);
  // Put the cause in the message text so it survives string-coercing surfaces (Chrome's Errors
  // panel); the Error arg still carries the stack in the console. Metadata only, never the token.
  logger.error(`Cloud sync enable failed: ${detail}`, err);
  return { ok: false, reason: 'error', detail };
}

/** Details lookup — deliberately NOT serialized (see handleSyncControlMessage). */
async function runDetails(
  engine: SyncEngineControlSurface,
  refreshEnvelope: boolean | undefined
): Promise<SyncDetailsResponse> {
  // Hydration owns lastSyncedAt as well as the cycle; without this the stamp is only correct
  // because getAccount's network hop happens to outlast two local reads on a cold worker.
  await engine.ensureHydrated();
  // Both are network hops on the panel-open path, and neither throws.
  const [account, recoveryEnvelopePresent] = await Promise.all([
    engine.getAccount(),
    refreshEnvelope ? engine.refreshRecoveryEnvelope() : engine.getRecoveryEnvelopePresent(),
  ]);
  return {
    ok: true,
    kind: 'details',
    details: buildSyncDetails(account, engine.getLastSyncedAt(), recoveryEnvelopePresent),
  };
}

/**
 * Read-only last-cycle lookup — deliberately NOT serialized (see handleSyncControlMessage).
 * Awaits hydration first: this listener is registered synchronously while start() waits on the
 * settings migration, so a cold worker would otherwise answer "no cycle has run" for a device
 * whose stored record says it has been failing for an hour.
 */
async function runLastCycle(
  engine: SyncEngineControlSurface
): Promise<SyncLastCycleResponse | Extract<SyncControlResponse, { ok: false }>> {
  await engine.ensureHydrated();
  const read = engine.getLastCycle();
  if (!read.known) {
    // Not `outcome:null` — that means "none ran" and would clear the badge. A failed response is
    // what the bridge turns into LAST_CYCLE_UNAVAILABLE.
    return { ok: false, reason: 'error', detail: 'last cycle unreadable' };
  }
  return {
    ok: true,
    kind: 'lastCycle',
    outcome: read.cycle === null ? null : read.cycle.outcome,
  };
}

async function runOp(
  engine: SyncEngineControlSurface,
  msg: SyncControlMessage & {
    op: Exclude<SyncControlMessage['op'], 'details' | 'getLastCycle'>;
  },
  deps: SyncControlDeps
): Promise<SyncControlResponse | SyncOutcomeResponse> {
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
        return { ok: true, kind: 'outcome', outcome: await engine.syncNow() };
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
    // Coerced for a non-Error throw: without it the page realm's log names no cause at all, and the
    // raw value is only visible in the worker's console. describeThrown, because a bare String() on
    // a null-prototype object throws HERE and the router would answer nothing at all.
    return { ok: false, reason: 'error', detail: describeThrown(err) };
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
    // Bypasses the mutex so a slow account fetch cannot delay a queued user action (e.g. a
    // disable click). Its one write, the envelope flag, is epoch-guarded in the engine.
    return runDetails(engine, msg.refreshRecoveryEnvelope);
  }
  if (op === 'getLastCycle') {
    // Same rationale as 'details': read-only, so it must never queue behind a pending op.
    return runLastCycle(engine);
  }
  if (op === 'disable') {
    // Deliberately outside the mutex, unlike enable/reconnect: queued behind an in-flight enable
    // it could only land once that enable had finished — the engine's own cancellation would
    // never see it, and the user's Disconnect would arrive after Chrome sync had been handed off.
    // The engine is what makes this safe: disableSync bumps the epoch first and synchronously.
    return runOp(engine, { ...msg, op }, deps);
  }
  return serialize(() => runOp(engine, { ...msg, op }, deps));
}
