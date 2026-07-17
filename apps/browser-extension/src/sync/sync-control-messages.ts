import type { EnableResult, SyncDetails } from '@cuewise/app';
import type { SyncSignInProvider } from '@cuewise/sync-engine';

// One source of truth for the op list and its type, so the runtime guard can't desync from the union.
export const SYNC_CONTROL_OPS = [
  'enable',
  'reconnect',
  'disable',
  'regenerate',
  'syncNow',
  'details',
] as const;
export type SyncControlOp = (typeof SYNC_CONTROL_OPS)[number];

/**
 * ENG-45 option B: the page realm has no sync engine of its own, so enable-sync UI
 * control actions are relayed to the background over chrome.runtime messaging. `kind`
 * lets the background filter these out of other messaging (e.g. sync-messages.ts).
 */
export interface SyncControlMessage {
  kind: 'cuewise-sync-control';
  op: SyncControlOp;
  // enable-only: the sign-in provider and the credential to exchange for a session.
  provider?: SyncSignInProvider;
  credential?: string;
  // reconnect-only (dev-only in this change): replays the persisted account id.
  accountId?: string;
  deviceName?: string;
  recoveryCode?: string;
}

// Character-identical to the app's EnableResult — reuse it so the two can't drift.
export type SyncControlResponse = EnableResult;

/** Response to the 'details' op — kept OUT of SyncControlResponse so EnableResult narrowing stays intact. */
export interface SyncDetailsResponse {
  ok: true;
  details: SyncDetails | null;
}

export type SyncControlAnyResponse = SyncControlResponse | SyncDetailsResponse;

export function isSyncControlMessage(msg: unknown): msg is SyncControlMessage {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }
  const candidate = msg as Record<string, unknown>;
  if (candidate.kind !== 'cuewise-sync-control') {
    return false;
  }
  const ops: readonly string[] = SYNC_CONTROL_OPS;
  return typeof candidate.op === 'string' && ops.includes(candidate.op);
}
