---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Settings changed on another device now appear straight away. Cloud Sync writes them to this device as soon as it downloads them, but the open tab kept showing the old values until you changed something else or reloaded — so a theme you picked on your laptop looked like it hadn't arrived.
