---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/crypto': patch
'@cuewise/sync-client': patch
'@cuewise/sync-engine': patch
'@cuewise/api': patch
'@cuewise/app': patch
---

Device pairing now stops straight away if the other device's key arrives damaged, instead of waiting out the full ten minutes.
