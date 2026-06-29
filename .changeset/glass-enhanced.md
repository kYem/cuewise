---
'@cuewise/browser-extension': minor
'@cuewise/shared': minor
---

feat(glass): opt-in "Enhanced glass" for richer frosted surfaces

The Glass theme gains an opt-in enhancement (new `glassEnhanced` setting, default
off) that makes the frosted surfaces feel more like real glass:

- saturation so the background photo's colour shows through the frost instead of
  graying out
- a lit top edge + soft drop shadow so cards read as floating glass
- a text-shadow plus an edge-only top/bottom scrim for legibility over bright
  photos, without dimming the middle of the photo
- honours `prefers-reduced-transparency`

Toggle it in the Theme Switcher's **Glass** section (shown only while the Glass
theme is active). The default Glass look is unchanged.
