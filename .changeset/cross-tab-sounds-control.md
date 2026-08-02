---
'@cuewise/browser-extension': patch
'@cuewise/app': patch
---

Play, pause, stop and playlist changes made in one tab now reach the tab that is actually playing the music. Only one tab drives YouTube playback, and the others were updating their own controls without ever telling it — so pressing play in a second tab showed "playing" and stayed silent. Ambient sounds still play from whichever tab you started them in, and now stop there when you stop them from any tab.
