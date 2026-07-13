import { hlcCompare, hlcDecode } from '@cuewise/shared';

// The decrypted body carried in each record's ciphertext. entity === null means a tombstone;
// the hlc travels with it so delete-vs-edit resolves by LWW like any other conflict.
export interface RecordBody {
  entity: unknown | null;
  hlc: string; // hlcEncode
}

export type Resolution = { winner: 'incoming'; body: RecordBody } | { winner: 'local' };

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
    if (hlcCompare(hlcDecode(incoming.hlc), hlcDecode(local.hlc)) > 0) {
      return { winner: 'incoming', body: incoming };
    }
    return { winner: 'local' };
  }
}
