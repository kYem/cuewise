import { vi } from 'vitest';
import {
  countCursorReset,
  SYNC_META_KEY,
  type SyncMeta,
  type SyncMetadataStore,
} from '../metadata-store';
import type { FakeKvStore } from './fake-kv-store';

/** What the engine's resetPullCursor writes, for cycle tests that land one mid-round-trip. */
export function resetCursor(metaStore: SyncMetadataStore): Promise<void> {
  return metaStore.update((meta) => {
    meta.cursor = 0;
    meta.seqs = {};
    countCursorReset(meta);
  });
}

/** Runs `during` once, as a ledger write moves a non-zero cursor back to zero. */
export function onCursorReset(kv: FakeKvStore, during: () => void): void {
  const set = kv.set.bind(kv);
  let ran = false;
  vi.spyOn(kv, 'set').mockImplementation(async (written, value, area) => {
    if (written === SYNC_META_KEY && !ran && (value as SyncMeta).cursor === 0) {
      const stored = await kv.get<SyncMeta>(SYNC_META_KEY, 'local');
      if (stored !== null && stored.cursor > 0) {
        ran = true;
        during();
      }
    }
    return set(written, value, area);
  });
}
