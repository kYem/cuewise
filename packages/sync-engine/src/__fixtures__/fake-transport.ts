import type { PushRecord, SyncRecord } from '@cuewise/shared';
import { PULL_PAGE, type SyncTransport } from '../cycle';

/** In-memory SyncTransport fake; records pushed batches and serves canned pull records by page. */
export class FakeTransport implements SyncTransport {
  readonly pushedBatches: PushRecord[][] = [];
  rejectPush = false;
  /** Canned server-side records for getChanges to page through, sorted by seq. */
  pullRecords: SyncRecord[] = [];
  /** Thrown by the next getChanges call(s) instead of returning a page, e.g. a resync ApiError. */
  getChangesError: Error | null = null;
  /** `since` argument of every getChanges call, in order — lets tests assert pagination. */
  readonly getChangesSinceCalls: number[] = [];
  private cursor = 0;

  async pushChanges(records: PushRecord[]): Promise<{ cursor: number }> {
    if (this.rejectPush) {
      throw new Error('FakeTransport: simulated pushChanges failure');
    }
    this.pushedBatches.push(records);
    this.cursor += records.length;
    return { cursor: this.cursor };
  }

  async getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    this.getChangesSinceCalls.push(since);
    if (this.getChangesError !== null) {
      throw this.getChangesError;
    }
    const page = this.pullRecords.filter((r) => r.seq > since).slice(0, PULL_PAGE);
    const cursor = page.length > 0 ? page[page.length - 1].seq : since;
    return { records: page, cursor };
  }
}
