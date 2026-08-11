# CLAUDE.md - E2E Crypto (`@cuewise/crypto`)

The client-side end-to-end crypto library (ENG-44). Self-contained, **zero runtime dependencies**, pure WebCrypto — it knows nothing about HTTP, sync, or storage. Its one job: turn plaintext domain entities into opaque ciphertext the server can never read, and manage the keys that do it.

## The one rule: never roll your own primitives

Every cryptographic operation delegates to the platform's `crypto.subtle` (audited, constant-time, native): AES-256-GCM (`encrypt`/`decrypt`), HKDF-SHA-256 (`deriveBits`), SHA-256 (`digest`), and `crypto.getRandomValues`. This package implements **zero** primitives. What *is* local is non-cryptographic framing — the envelope string format, base64url, and the Crockford recovery-code layout. Keep it that way: a bug in framing is recoverable; a hand-rolled cipher is not.

## Public surface (`src/index.ts`)

Exports `base64url`, `envelope`, `errors`, `keys`, `pairing`, `recovery-code`. **`primitives.ts` is deliberately NOT exported** — it is the swappable WebCrypto backend seam (a future non-WebCrypto runtime replaces that one file), and `getSubtle()` throws a clear error if `crypto.subtle` is absent rather than failing opaquely. `base64url.ts` is framing rather than a primitive, so it lives outside that seam and callers that put a key on the wire (device pairing) encode through it.

- `generateRecoveryCode()` / `parseRecoveryCode()` → the `CW1-…` code (150-bit machine entropy + 25-bit checksum); `secret` is a branded `RecoverySecret`.
- `deriveMasterKey(secret)` → branded `MasterKey`; `generateDataKey()` → branded `DataKey`. The brands make a swapped `mk`/`dk` (or code-for-secret) a compile error, not a silent wrong-key derivation.
- `wrapDataKey` / `unwrapDataKey` → the opaque recovery blob stored server-side.
- Pairing key material is branded too — `PairingCommitment` / `PairingPublicKeyB64` / `PairingNonceB64` / `PeerWrappedEnvelope`, minted by `makePairingCommitment` / `encodePairingPublicKey` / `encodePairingNonce` / `wrapDataKeyToPeer`. `PairingPublicKey`/`PairingNonce` brand the 32-byte forms too, which is what stops `encodePairingPublicKey(nonce)` compiling — the swap that would otherwise survive as a correctly-branded string. Brands carry positional identity only, never a validity claim, so `decodePairingPublicKey` is what enforces the 32-byte length. `@cuewise/sync-client` and `apps/api` import them (types only) rather than redeclaring.
- `sealRecord` / `openRecord` → per-record AES-256-GCM envelope `v1.<keyId>.<iv>.<ct>`, AAD `v1|collection|entityId` (components reject `|`).

## Frozen formats

The wire formats (record envelope, wrapped-key blob, recovery-code layout, HKDF derivation) are **frozen** — golden fixtures in `src/__fixtures__/` are committed vectors that must decode forever. **Never regenerate them.** A format change is a new `v`/`keyId` version decoded side-by-side, not an edit to `v1`.

The pairing SAS transcript, commitment, and `v1|pairing|…` wrap AAD (`pairing.ts`) are frozen for the same reason but across app versions, not just installs — a requester and approver may run different builds. Same rule: a change is a side-by-side v2, never an edit in place.

## Consumers

`@cuewise/sync-engine` calls the key, recovery-code, record-sealing and pairing functions; `@cuewise/sync-client` and `apps/api` import the pairing brands **type-only**, so nothing from here is emitted into either bundle (both still declare it as a workspace dependency). Import directly from `@cuewise/crypto`, with one exception: `@cuewise/sync-engine` re-exports `RecoveryCodeError`, which hosts `instanceof`-check to match `enableSync`'s thrown-error contract, plus its `RecoveryCodeErrorKind` union and `PairingCommitment` — so the extension and macOS apps need no crypto dependency of their own.

## Tests

Co-located `*.test.ts`, Vitest node env with `restoreMocks: true` (spies on `crypto.subtle` globals must not outlive a test). Coverage locks the security-critical paths: AAD swap-defense (proven, mutation-checked), wrong-key/tamper → typed `DecryptError`, malformed-envelope → `EnvelopeParseError`, recovery-code checksum/version/normalization, b64url chunk boundaries, cache eviction-on-rejection, missing-WebCrypto guard, and a two-device golden-path round trip.
