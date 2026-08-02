---
'@cuewise/browser-extension': patch
'@cuewise/app': patch
---

Play, pause, stop and playlist changes made in one tab now reach the tab that is actually playing. Only one tab drives the audio, and the others were updating their own controls without ever telling it — so pressing play in a second tab showed "playing" and stayed silent.
