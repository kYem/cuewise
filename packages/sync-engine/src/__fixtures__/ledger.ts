import { vi } from 'vitest';
import {
  countCursorReset,
  cursorResetsOf,
  SYNC_META_KEY,
  type SyncMeta,
  type SyncMetadataStore,
} from '../metadata-store';
import type { FakeKvStore } from './fake-kv-store';

/** resetPullCursor's cursor-and-seqs reset, for cycle tests that land one mid-round-trip. */
export function resetCursor(metaStore: SyncMetadataStore): Promise<void> {
  return metaStore.update((meta) => {
    meta.cursor = 0;
    meta.seqs = {};
    countCursorReset(meta);
  });
}

/** Runs `during` once, as a ledger write counts a cursor reset. */
export function onCursorReset(kv: FakeKvStore, during: () => void): void {
  const set = kv.set.bind(kv);
  let ran = false;
  vi.spyOn(kv, 'set').mockImplementation(async (written, value, area) => {
    if (written === SYNC_META_KEY && !ran) {
      const stored = await kv.get<SyncMeta>(SYNC_META_KEY, 'local');
      const before = stored === null ? 0 : cursorResetsOf(stored);
      if (cursorResetsOf(value as SyncMeta) > before) {
        ran = true;
        during();
      }
    }
    return set(written, value, area);
  });
}
