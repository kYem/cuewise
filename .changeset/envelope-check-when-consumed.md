---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/sync-engine': patch
---

Stop Cloud Sync asking the server about your recovery code every five minutes. The extension re-checked it on every background wake — around 288 requests a day — even though the only thing that reads the answer is a banner in Settings. The check now runs when that panel opens, and the background one runs only if this device has actually lost its key, which is the case where the answer changes anything.
