/**
 * ENG-45 option B: the page realm has no sync engine of its own, so enable-sync UI
 * control actions are relayed to the background over chrome.runtime messaging. `kind`
 * lets the background filter these out of other messaging (e.g. sync-messages.ts).
 */
export type SyncControlOp = 'enable' | 'reconnect' | 'disable' | 'regenerate' | 'syncNow';

export interface SyncControlMessage {
  kind: 'cuewise-sync-control';
  op: SyncControlOp;
  accountId?: string;
  deviceName?: string;
  recoveryCode?: string;
}

export type SyncControlResponse =
  | { ok: true; recoveryCode?: string }
  | { ok: false; reason: 'needs-code' | 'bad-code' | 'auth' | 'error'; detail?: string };

const SYNC_CONTROL_OPS: SyncControlOp[] = [
  'enable',
  'reconnect',
  'disable',
  'regenerate',
  'syncNow',
];

export function isSyncControlMessage(msg: unknown): msg is SyncControlMessage {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }
  const candidate = msg as Record<string, unknown>;
  if (candidate.kind !== 'cuewise-sync-control') {
    return false;
  }
  return SYNC_CONTROL_OPS.includes(candidate.op as SyncControlOp);
}
