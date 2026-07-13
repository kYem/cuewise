# CLAUDE.md - E2E Crypto (`@cuewise/crypto`)

The client-side end-to-end crypto library (ENG-44). Self-contained, **zero runtime dependencies**, pure WebCrypto — it knows nothing about HTTP, sync, or storage. Its one job: turn plaintext domain entities into opaque ciphertext the server can never read, and manage the keys that do it.

## The one rule: never roll your own primitives

Every cryptographic operation delegates to the platform's `crypto.subtle` (audited, constant-time, native): AES-256-GCM (`encrypt`/`decrypt`), HKDF-SHA-256 (`deriveBits`), SHA-256 (`digest`), and `crypto.getRandomValues`. This package implements **zero** primitives. What *is* local is non-cryptographic framing — the envelope string format, base64url, and the Crockford recovery-code layout. Keep it that way: a bug in framing is recoverable; a hand-rolled cipher is not.

## Public surface (`src/index.ts`)

Exports `envelope`, `errors`, `keys`, `recovery-code`. **`primitives.ts` is deliberately NOT exported** — it is the swappable WebCrypto backend seam (a future non-WebCrypto runtime replaces that one file), and `getSubtle()` throws a clear error if `crypto.subtle` is absent rather than failing opaquely.

- `generateRecoveryCode()` / `parseRecoveryCode()` → the `CW1-…` code (150-bit machine entropy + 25-bit checksum); `secret` is a branded `RecoverySecret`.
- `deriveMasterKey(secret)` → branded `MasterKey`; `generateDataKey()` → branded `DataKey`. The brands make a swapped `mk`/`dk` (or code-for-secret) a compile error, not a silent wrong-key derivation.
- `wrapDataKey` / `unwrapDataKey` → the opaque recovery blob stored server-side.
- `sealRecord` / `openRecord` → per-record AES-256-GCM envelope `v1.<keyId>.<iv>.<ct>`, AAD `v1|collection|entityId` (components reject `|`).

## Frozen formats

The wire formats (record envelope, wrapped-key blob, recovery-code layout, HKDF derivation) are **frozen** — golden fixtures in `src/__fixtures__/` are committed vectors that must decode forever. **Never regenerate them.** A format change is a new `v`/`keyId` version decoded side-by-side, not an edit to `v1`.

## Consumers

Nothing calls this yet — ENG-45 wires the extension/macOS stores through `sealRecord`/`openRecord` and the enable/enroll flows through the key + recovery-code functions. Import directly from `@cuewise/crypto`; it is **not** re-exported by `@cuewise/sync-client` (crypto is the leaf; the sync client is the transport that will depend on it).

## Tests

Co-located `*.test.ts`, Vitest node env with `restoreMocks: true` (spies on `crypto.subtle` globals must not outlive a test). Coverage locks the security-critical paths: AAD swap-defense (proven, mutation-checked), wrong-key/tamper → typed `DecryptError`, malformed-envelope → `EnvelopeParseError`, recovery-code checksum/version/normalization, b64url chunk boundaries, cache eviction-on-rejection, missing-WebCrypto guard, and a two-device golden-path round trip.
