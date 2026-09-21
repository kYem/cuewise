import type { PushRecord, PushResponse, SyncRecord } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import { PULL_PAGE, type SyncTransport } from '../cycle';

/** In-memory SyncTransport fake; records pushed batches and serves canned pull records by page. */
export class FakeTransport implements SyncTransport {
  readonly pushedBatches: PushRecord[][] = [];
  rejectPush = false;
  /**
   * Server rows the push checks `baseSeq` against and assigns seqs into, keyed
   * "collection/entityId". Seed one to script a conflict; a push without `baseSeq` overwrites it.
   */
  readonly serverRecords = new Map<string, SyncRecord>();
  /** A pre-compare-and-set server: ignores `baseSeq` and answers as ApiClient normalises it. */
  legacyPushResponse = false;
  /** Canned server-side records for getChanges to page through, sorted by seq. */
  pullRecords: SyncRecord[] = [];
  /** Thrown by EVERY getChanges call until reset — a persistently failing transport. */
  getChangesError: Error | null = null;
  /** `since` argument of every getChanges call, in order — lets tests assert pagination. */
  readonly getChangesSinceCalls: number[] = [];
  private cursor = 0;
  private nextGetChangesError: Error | null = null;

  /** One-shot: fails the next getChanges as the server does on a discarded cursor, then clears. */
  rejectNextGetChangesWithResync(): void {
    this.nextGetChangesError = new ApiError('resync_required', 409);
  }

  async pushChanges(records: PushRecord[]): Promise<PushResponse> {
    if (this.rejectPush) {
      throw new Error('FakeTransport: simulated pushChanges failure');
    }
    this.pushedBatches.push(records);
    // A seeded row carries its own seq; new seqs must stay above it, as the real store's do.
    for (const row of this.serverRecords.values()) {
      this.cursor = Math.max(this.cursor, row.seq);
    }
    const response: PushResponse = { cursor: this.cursor, applied: [], conflicts: [] };
    for (const rec of records) {
      const key = `${rec.collection}/${rec.entityId}`;
      const current = this.serverRecords.get(key);
      // Like the real store: every row reserves a seq, used or not.
      this.cursor += 1;
      const stale =
        rec.baseSeq !== undefined && current !== undefined && current.seq !== rec.baseSeq;
      if (stale && !this.legacyPushResponse) {
        response.conflicts.push(current);
        continue;
      }
      const { baseSeq: _base, ...wire } = rec;
      this.serverRecords.set(key, { ...wire, seq: this.cursor });
      if (this.legacyPushResponse) {
        response.applied.push({ collection: rec.collection, entityId: rec.entityId });
      } else {
        response.applied.push({
          collection: rec.collection,
          entityId: rec.entityId,
          seq: this.cursor,
        });
      }
    }
    response.cursor = this.cursor;
    return response;
  }

  async getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    this.getChangesSinceCalls.push(since);
    if (this.getChangesError !== null) {
      throw this.getChangesError;
    }
    if (this.nextGetChangesError !== null) {
      const err = this.nextGetChangesError;
      this.nextGetChangesError = null;
      throw err;
    }
    const page = this.pullRecords.filter((r) => r.seq > since).slice(0, PULL_PAGE);
    const cursor = page.length > 0 ? page[page.length - 1].seq : since;
    return { records: page, cursor };
  }
}
