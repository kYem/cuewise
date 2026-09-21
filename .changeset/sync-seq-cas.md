---
'@cuewise/api': minor
'@cuewise/sync-client': minor
'@cuewise/sync-engine': minor
'@cuewise/shared': patch
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
---

Cloud sync refuses a push that would overwrite a newer edit and re-pushes a local edit the server had lost, so devices converge on the latest version.
