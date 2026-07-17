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

/**
 * Response to the 'details' op — kept OUT of SyncControlResponse so EnableResult narrowing stays
 * intact. `kind` discriminates it from EnableResult's own {ok:true} success, so the two success
 * shapes are mutually exclusive and can't be silently cross-assigned (ok alone isn't enough).
 */
export interface SyncDetailsResponse {
  ok: true;
  kind: 'details';
  details: SyncDetails | null;
}

/**
 * Ties each op to the response shape its SW handler produces, so the bridge's send<O> can't
 * silently mis-assume one (adding an op without an entry here is a compile error at send).
 */
export interface SyncOpResponse {
  enable: SyncControlResponse;
  reconnect: SyncControlResponse;
  disable: SyncControlResponse;
  regenerate: SyncControlResponse;
  syncNow: SyncControlResponse;
  details: SyncDetailsResponse;
}

/** Any op's response — derived from the map so the two never drift. */
export type SyncControlAnyResponse = SyncOpResponse[SyncControlOp];

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
