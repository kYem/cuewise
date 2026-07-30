---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
---

Make the import preview readable, and harden two storage reads. Importing a file with many unrecognised categories or session types now says so once per kind ("12 quotes had unrecognised categories…") instead of once per row, and the warning list is capped at five with a count of the rest, so the Import button stays where you can reach it. A stored list containing a corrupt row no longer stops the whole list being read. And if Cuewise cannot clear the old quotes storage after moving your library, it empties it instead of leaving a copy that could bring back a quote you deleted afterwards.
