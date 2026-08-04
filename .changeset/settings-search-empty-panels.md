---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
---

Searching your settings lands you on a control instead of a blank panel. Words like "format", "breaks", "digital" and "custom" matched a section but nothing inside it, so the section opened empty — and the settings they describe live behind a switch that was turned off, which is exactly when you'd be searching for them. Those searches now land on the switch that reveals them.
