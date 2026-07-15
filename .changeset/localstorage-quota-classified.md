---
'@cuewise/storage': patch
'@cuewise/macos': patch
---

Storage-full errors are now recognized on the macOS app (and any localStorage-backed context): a quota failure surfaces as "storage is full" guidance instead of a generic retry suggestion that could never succeed.
