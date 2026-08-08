---
'@cuewise/sync-client': minor
'@cuewise/shared': minor
'@cuewise/api': minor
---

An account export now includes the wrapped key envelopes, so the archive can be decrypted offline with nothing but your recovery code. Previously it held ciphertext and no key — undecryptable even by the person who exported it.
