import { hlcCompare, hlcDecode } from '@cuewise/shared';

// The decrypted body carried in each record's ciphertext. entity === null means a tombstone;
// the hlc travels with it so delete-vs-edit resolves by LWW like any other conflict.
export interface RecordBody {
  entity: unknown | null;
  hlc: string; // hlcEncode
}

/**
 * `same` is what a device sees when its own push echoes back on the next pull; only `newer` means
 * the server holds something older than this device and needs repairing.
 */
export type Resolution =
  | { winner: 'incoming'; body: RecordBody }
  | { winner: 'local'; reason: 'newer' | 'same' };

export interface ConflictStrategy {
  // Compare an incoming decrypted body against the local one; decide who wins.
  resolve(local: RecordBody | null, incoming: RecordBody): Resolution;
}

/** v1 policy: last-write-wins by HLC. The only place that knows about HLCs. */
export class LwwHlcStrategy implements ConflictStrategy {
  resolve(local: RecordBody | null, incoming: RecordBody): Resolution {
    if (local === null) {
      return { winner: 'incoming', body: incoming };
    }
    const cmp = hlcCompare(hlcDecode(incoming.hlc), hlcDecode(local.hlc));
    if (cmp > 0) {
      return { winner: 'incoming', body: incoming };
    }
    if (cmp === 0) {
      return { winner: 'local', reason: 'same' };
    }
    return { winner: 'local', reason: 'newer' };
  }
}
