import type { ConflictStrategy, RecordBody, Resolution } from '../strategy';

/**
 * Swappability proof: always keeps local (as `same`, so it never triggers the repair push). If the
 * engine had any hardcoded LWW, wiring this in would be a no-op — it must block pulled writes.
 */
export class NoopStrategy implements ConflictStrategy {
  resolve(_local: RecordBody | null, _incoming: RecordBody): Resolution {
    return { winner: 'local', reason: 'same' };
  }
}
