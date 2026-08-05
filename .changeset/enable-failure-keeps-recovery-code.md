---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/sync-engine': patch
---

Stop a failed Cloud Sync setup throwing away the recovery code it had already created. If setting up hit a problem after the account was made — a full disk, a dropped connection at the wrong moment — the code was discarded while the account itself lived on, and nothing could open it again. The code is now shown whichever way setup fails, so you can save it and get back in.
