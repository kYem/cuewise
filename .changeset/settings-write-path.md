---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Fix settings that could silently revert. Changing two settings in quick succession — nudging a slider while flipping a toggle — could quietly undo the first change, in the moment and on disk. Quote filter preferences were saved by a separate path that never reached cloud sync, so they stayed on one device; they now sync like every other preference. Settings also survive a change arriving from another device mid-edit. If storage is full, saving a setting says so instead of appearing to succeed.
