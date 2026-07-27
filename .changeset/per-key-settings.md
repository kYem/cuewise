---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Settings are now stored one at a time rather than as a single record. Changing a setting on one device can no longer overwrite a change arriving from another, and settings you have never touched now follow Cuewise's defaults, so improvements to those defaults reach you instead of being frozen at whatever they were when you first changed something.
