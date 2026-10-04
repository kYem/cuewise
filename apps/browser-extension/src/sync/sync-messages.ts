/**
 * ENG-45 option B: the page realm has no sync engine of its own (MV3 page and
 * service-worker are separate JS module states), so it relays mutations to the
 * background over chrome.runtime messaging instead. `kind` lets the background
 * filter these out of any other extension messaging on the same channel.
 */
export type SyncMutationMark =
  | { op: 'mutated' | 'deleted'; collection: string; entityId: string }
  | { op: 'mutatedBulk'; collection: string; entityIds: string[] };

/** Every mark queued since the last ack, in the order the stores made them. */
export interface SyncMutationMessage {
  kind: 'cuewise-sync-mutation';
  marks: SyncMutationMark[];
}

/** The worker's reply, sent only once the dirty marks are in the ledger (or failed to get there). */
export type SyncMutationAck = { ok: true } | { ok: false; reason: 'malformed' | 'error' };
