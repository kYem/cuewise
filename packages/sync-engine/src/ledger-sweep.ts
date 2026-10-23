import { DAY_IN_MS, hlcDecode, logger, SYNC_SESSION_TTL_MS } from '@cuewise/shared';
import type { CollectionBinding } from './collections';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';

/**
 * The server's tombstone retention, timed from the delete's hlc rather than its receipt. Past it
 * a peer idle that long re-lists from zero, so the entry only re-asserts a delete the server forgot.
 */
export const LEDGER_RETENTION_MS = SYNC_SESSION_TTL_MS;
const SWEEP_EVERY_MS = DAY_IN_MS;

export interface LedgerSweepDeps {
  meta: SyncMetadataStore;
  bindings: CollectionBinding[];
  now: () => number;
  isCancelled: () => boolean;
}

/**
 * Forgets the hlc, seq and tombstone of every key deleted here, settled with the server and older
 * than the retention window. Runs at most daily; a failed read skips that collection.
 */
export async function forgetSettledDeletes(deps: LedgerSweepDeps): Promise<number> {
  const snapshot = await deps.meta.load();
  const wallMs = deps.now();
  if (snapshot.ledgerSweptAt !== undefined && wallMs - snapshot.ledgerSweptAt < SWEEP_EVERY_MS) {
    return 0;
  }
  const candidates = new Map<string, string>();
  for (const binding of deps.bindings) {
    if (binding.deletable === false) {
      continue;
    }
    let local: Record<string, unknown>;
    try {
      local = await binding.readAll();
    } catch (error) {
      logger.error(`Sync ledger sweep could not read ${binding.name}; skipping it`, error);
      continue;
    }
    for (const key of settledDeletes(snapshot, binding.name, local, wallMs)) {
      candidates.set(key, snapshot.hlcs[key]);
    }
  }
  if (deps.isCancelled()) {
    return 0;
  }
  const forgotten = new Set<string>();
  await deps.meta.update((fresh) => {
    fresh.ledgerSweptAt = wallMs;
    for (const [key, hlc] of candidates) {
      // Re-created or re-pulled since the read above: that edit owns the entry now.
      if (fresh.hlcs[key] !== hlc || isDirty(fresh, key)) {
        continue;
      }
      delete fresh.hlcs[key];
      delete fresh.seqs[key];
      forgotten.add(key);
    }
    fresh.tombstones = fresh.tombstones.filter((t) => !forgotten.has(t));
  });
  if (forgotten.size > 0) {
    logger.debug(`Sync ledger forgot ${forgotten.size} settled delete(s)`);
  }
  return forgotten.size;
}

function settledDeletes(
  meta: SyncMeta,
  collection: string,
  local: Record<string, unknown>,
  wallMs: number
): string[] {
  const prefix = SyncMetadataStore.entityKey(collection, '');
  const keys: string[] = [];
  for (const [key, hlc] of Object.entries(meta.hlcs)) {
    if (!key.startsWith(prefix) || key.slice(prefix.length) in local) {
      continue;
    }
    // No seq: the server never acked it, so the delete may still have to be pushed.
    if (meta.seqs[key] === undefined || isDirty(meta, key) || meta.quarantine.includes(key)) {
      continue;
    }
    const deletedAt = physicalOf(hlc);
    if (deletedAt === null || wallMs - deletedAt < LEDGER_RETENTION_MS) {
      continue;
    }
    keys.push(key);
  }
  return keys;
}

// The sweep is the one reader of every stored hlc, so one malformed entry must not stop it.
function physicalOf(hlc: unknown): number | null {
  if (typeof hlc !== 'string') {
    return null;
  }
  try {
    const { physical } = hlcDecode(hlc);
    return Number.isFinite(physical) ? physical : null;
  } catch {
    return null;
  }
}

function isDirty(meta: SyncMeta, key: string): boolean {
  const slash = key.indexOf('/');
  return meta.dirty[key.slice(0, slash)]?.includes(key.slice(slash + 1)) ?? false;
}
