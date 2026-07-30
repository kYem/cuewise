---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Cloud Sync now tells you when it isn't working. A sync that fails no longer shows as active with a fresh "Last synced" time, and "Sync now" no longer reports success for a sync that didn't complete. When something goes wrong you'll see what kind of problem it is — offline, a problem on our side, or something on this device — with your account details and controls still available.
