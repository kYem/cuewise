import { describe, expect, it } from 'vitest';
import type { RawSessionToken, SessionTokenHash } from './crypto-utils';
import type { SyncStore } from './store';

// Compile-time guard: if the RawSessionToken/SessionTokenHash brands collapsed back to plain
// string, the @ts-expect-error directives below would go unused and `tsc` would fail the build.
describe('session token brands', () => {
  it('keeps raw tokens and hashes unassignable to each other on the SyncStore surface', () => {
    function _guard(store: SyncStore, raw: RawSessionToken, hash: SessionTokenHash): void {
      void store.revokeSession(raw);
      void store.bumpRateWindow(hash, 1000);
      // @ts-expect-error a SessionTokenHash must not satisfy a RawSessionToken parameter
      void store.revokeSession(hash);
      // @ts-expect-error a RawSessionToken must not satisfy a SessionTokenHash parameter
      void store.bumpRateWindow(raw, 1000);
    }
    expect(typeof _guard).toBe('function');
  });
});
