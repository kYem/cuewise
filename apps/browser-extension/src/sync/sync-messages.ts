/**
 * ENG-45 option B: the page realm has no sync engine of its own (MV3 page and
 * service-worker are separate JS module states), so it relays mutations to the
 * background over chrome.runtime messaging instead. `kind` lets the background
 * filter these out of any other extension messaging on the same channel.
 */
export type SyncMutationOp = 'mutated' | 'deleted' | 'mutatedBulk';

export interface SyncMutationMessage {
  kind: 'cuewise-sync-mutation';
  op: SyncMutationOp;
  collection: string;
  entityId?: string;
  entityIds?: string[];
}
