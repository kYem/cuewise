---
'@cuewise/browser-extension': patch
---

fix(background): the glass-theme daily background now recovers from a removed/404 Unsplash image instead of getting stuck on the dark fallback. The daily background is verified to load before it's cached or persisted, and a dead stored image is replaced with a fresh working one. Also drops an aurora photo Unsplash has removed.
