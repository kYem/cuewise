import type { ConflictStrategy, RecordBody, Resolution } from '../strategy';

/**
 * Swappability proof: always keeps local, never accepts incoming. If the engine had any
 * hardcoded LWW, wiring this in would be a no-op — instead it must fully block pulled writes.
 */
export class NoopStrategy implements ConflictStrategy {
  resolve(_local: RecordBody | null, _incoming: RecordBody): Resolution {
    return { winner: 'local' };
  }
}
