# Cuewise promo video

A ~68-second 1080p promo explaining what Cuewise is and walking through its core features:

| Time | Scene |
|---|---|
| 0:00 | Logo + tagline |
| 0:05 | Hook: "You open a new tab dozens of times a day. What if every one helped you focus?" |
| 0:10 | Meet Cuewise: a calm new tab |
| 0:17 | Today's Focus (daily goals) |
| 0:23 | Pomodoro timer |
| 0:28 | Focus mode |
| 0:33 | Quotes (100 curated, 10 categories) |
| 0:39 | Concept cards (spaced repetition) |
| 0:44 | Insights |
| 0:50 | Four themes, light/dark, densities |
| 0:55 | Privacy: local-first, no trackers, optional E2E sync |
| 1:01 | Call to action: Add to Chrome, cuewise.app |

The video is code: `composition.html` lays out every scene and exposes `window.promo.seek(t)`, which
places each element for time `t`. `render.mts` steps through it frame by frame in headless Chromium
and pipes the frames into ffmpeg. `music.mts` synthesizes the ambient soundtrack, with a chime on each
scene cut, so there are no licensing questions. It uses the real product screenshots in
`src/assets/` and `public/images/`, and loads its fonts from `@fontsource`, so rendering works offline.

## Render

From `apps/website`, with an ffmpeg that has libx264 on `PATH` (or `FFMPEG=/path/to/ffmpeg`):

```bash
pnpm promo                     # → promo/out/cuewise-promo.mp4
pnpm promo --still 20          # one frame → promo/out/still-20.png
pnpm promo --from 17 --to 23   # render a single scene
pnpm promo --fps 60
```

`CHROMIUM_PATH` points it at a specific Chromium if Playwright's bundled one isn't installed.

To preview live, open `composition.html` in a browser. It loops in real time; add `?t=20` to freeze
on one frame.

`out/` is gitignored, like `store-assets/`. Rendered videos are regenerable and would bloat history.

## Editing

- **Timing:** each `<section class="scene">` has `data-start` / `data-end` in seconds. Neighbouring
  scenes overlap by ~0.3s so they crossfade.
- **Entrances:** any element with `data-fx="up|rise|left|drop|pop|scale|word"` animates in at
  `data-at` seconds after its scene starts (`data-dur` sets the length, 0.8s by default).
- **Screenshots:** `data-kb="fromScale,toScale,originX%,originY%"` adds a slow Ken Burns zoom.
- **Counters:** `data-count="from,to,at,dur"` counts up. `data-clock="seconds,at,rate"` counts down
  as `mm:ss`.
