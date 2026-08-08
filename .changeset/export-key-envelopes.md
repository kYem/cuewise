---
'@cuewise/sync-client': minor
'@cuewise/shared': minor
'@cuewise/api': minor
---

An account export now includes the wrapped key envelopes, so it is no longer permanently undecryptable. Previously it held ciphertext and no key — unreadable even by the person who exported it.
