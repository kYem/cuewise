import type { KeyValueStore } from '@cuewise/shared';
import { SYNC_DATA_KEY } from '../key-lifecycle';

/** Rewrites the persisted key as a build before ENG-128 stored it: the same key, no account beside it. */
export async function unbindPersistedDataKey(kv: KeyValueStore): Promise<void> {
  const stored = await kv.get<{ keyId: string; dkB64: string }>(SYNC_DATA_KEY, 'local');
  if (stored === null) {
    throw new Error('expected a persisted data key');
  }
  await kv.set(SYNC_DATA_KEY, { keyId: stored.keyId, dkB64: stored.dkB64 }, 'local');
}
