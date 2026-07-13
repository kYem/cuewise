import type { PushRecord, SyncRecord } from '@cuewise/shared';
import type { SyncTransport } from '../cycle';

/** In-memory SyncTransport fake; records pushed batches and returns an incrementing cursor. */
export class FakeTransport implements SyncTransport {
  readonly pushedBatches: PushRecord[][] = [];
  rejectPush = false;
  private cursor = 0;

  async pushChanges(records: PushRecord[]): Promise<{ cursor: number }> {
    if (this.rejectPush) {
      throw new Error('FakeTransport: simulated pushChanges failure');
    }
    this.pushedBatches.push(records);
    this.cursor += records.length;
    return { cursor: this.cursor };
  }

  async getChanges(_since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    return { records: [], cursor: this.cursor };
  }
}
