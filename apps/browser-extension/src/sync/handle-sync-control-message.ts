import { ApiError } from '@cuewise/sync-client';
import {
  RecoveryCodeError,
  RecoveryCodeRequiredError,
  type SyncStatus,
} from '@cuewise/sync-engine';
import type { SyncControlMessage, SyncControlResponse } from './sync-control-messages';

/** Structural subset of SyncEngine the SW control handler drives. */
export interface SyncControlEngine {
  enableSync(credential: string, deviceName: string, recoveryCode?: string): Promise<void>;
  disableSync(): Promise<void>;
  syncNow(): Promise<void>;
  regenerateRecoveryCode(): Promise<string>;
  getStatus(): SyncStatus;
}

export interface SyncControlDeps {
  /** Reads and clears the one-shot recovery-code capture slot owned by background.ts. */
  takeRecoveryCode: () => string | undefined;
}

// Builds the response from the thrown error AND the post-call status — a 401 during
// initial sync sets signed_out and returns rather than throws (mirrors macOS's error map).
async function doEnable(
  engine: SyncControlEngine,
  accountId: string,
  deviceName: string,
  recoveryCode: string | undefined,
  deps: SyncControlDeps
): Promise<SyncControlResponse> {
  deps.takeRecoveryCode(); // drain any stale value before this attempt
  try {
    await engine.enableSync(accountId, deviceName, recoveryCode);
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
    return { ok: false, reason: 'error', detail };
  }
  if (engine.getStatus() === 'signed_out') {
    return { ok: false, reason: 'auth' };
  }
  return { ok: true, recoveryCode: deps.takeRecoveryCode() };
}

async function runOp(
  engine: SyncControlEngine,
  msg: SyncControlMessage,
  deps: SyncControlDeps
): Promise<SyncControlResponse> {
  if (msg.op === 'enable') {
    if (msg.accountId === undefined || msg.deviceName === undefined) {
      return { ok: false, reason: 'error' };
    }
    return doEnable(engine, msg.accountId, msg.deviceName, msg.recoveryCode, deps);
  }
  if (msg.op === 'reconnect') {
    if (msg.accountId === undefined || msg.deviceName === undefined) {
      return { ok: false, reason: 'error' };
    }
    // Silent re-auth: no recovery code — relies on the persisted DK resume.
    return doEnable(engine, msg.accountId, msg.deviceName, undefined, deps);
  }
  if (msg.op === 'disable') {
    await engine.disableSync();
    return { ok: true };
  }
  if (msg.op === 'regenerate') {
    return { ok: true, recoveryCode: await engine.regenerateRecoveryCode() };
  }
  await engine.syncNow();
  return { ok: true };
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
  engine: SyncControlEngine,
  msg: SyncControlMessage,
  deps: SyncControlDeps
): Promise<SyncControlResponse> {
  return serialize(() => runOp(engine, msg, deps));
}
