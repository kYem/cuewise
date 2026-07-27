---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Cuewise now checks its own saved data before showing it. If a note, goal or setting on your device ever ends up in a shape this version cannot read — after a downgrade, or a sync from a newer device — that one item is skipped instead of breaking the page. Nothing else is touched, and anything a newer version added is left exactly as it was.
