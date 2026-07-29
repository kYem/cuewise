import type { EnableResult, SyncDetails } from '@cuewise/app';
import type { SyncOutcome, SyncSignInProvider } from '@cuewise/sync-engine';
import { z } from 'zod/mini';

// One source of truth for the op list and its type, so the runtime guard can't desync from the union.
export const SYNC_CONTROL_OPS = [
  'enable',
  'reconnect',
  'disable',
  'regenerate',
  'syncNow',
  'details',
  'getLastCycle',
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
 * intact. `kind` is a RUNTIME tag for the untyped SW↔page wire: it lets the bridge reject a skewed
 * SW's {ok:true} that carries no details. It buys nothing at compile time — this type is still
 * structurally assignable to EnableResult (excess properties only trip the checker on fresh object
 * literals). The per-op compile-time typing comes from SyncOpResponse + send<O>, not from this tag.
 */
export interface SyncDetailsResponse {
  ok: true;
  kind: 'details';
  details: SyncDetails | null;
}

/** Response to the 'syncNow' op — same kept-out-of-SyncControlResponse shape as SyncDetailsResponse. */
export interface SyncOutcomeResponse {
  ok: true;
  kind: 'outcome';
  outcome: SyncOutcome;
}

/** Response to the 'getLastCycle' op; `outcome` is null until the first cycle has run. */
export interface SyncLastCycleResponse {
  ok: true;
  kind: 'lastCycle';
  outcome: SyncOutcome | null;
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
  // Honestly both shapes: the router's error fallback answers ANY op with a failed
  // SyncControlResponse, so the bridge must narrow on `ok` rather than assume an outcome.
  syncNow: SyncOutcomeResponse | Extract<SyncControlResponse, { ok: false }>;
  details: SyncDetailsResponse;
  getLastCycle: SyncLastCycleResponse;
}

/** Any op's response — derived from the map so the two never drift. */
export type SyncControlAnyResponse = SyncOpResponse[SyncControlOp];

/**
 * Only the two fields the background dispatches on. The optional payload fields are
 * deliberately unchecked here — this guard's job is to decide whether a message on the
 * shared runtime channel is ours at all, and the handlers validate what they read.
 *
 * `loose` is documentation rather than behaviour: only `.success` is read and the caller
 * keeps the original message, so a strict object would work identically. It says the extra
 * fields are expected, not stray.
 */
const syncControlMessageSchema = z.looseObject({
  kind: z.literal('cuewise-sync-control'),
  op: z.enum(SYNC_CONTROL_OPS),
});

export function isSyncControlMessage(msg: unknown): msg is SyncControlMessage {
  return syncControlMessageSchema.safeParse(msg).success;
}
