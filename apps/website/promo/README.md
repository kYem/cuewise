# Cuewise promo video

A ~79-second 1080p promo explaining what Cuewise is. Instead of static screenshots it plays out a
recreated session in the Glass theme: a cursor opens a new tab and uses each core feature.

| Time | Scene |
|---|---|
| 0:00 | Logo + tagline |
| 0:04 | Hook: "You open a new tab dozens of times a day. What if every one helped you focus?" |
| 0:09 | A browser appears, the cursor opens a new tab and Cuewise loads |
| 0:13 | Today's Focus: types and adds a goal, checks two off, the progress ring fills |
| 0:20 | Quotes: refreshes to a new quote, favorites it, refreshes again |
| 0:26 | Pomodoro: picks a goal from the card header, turns on Rain from the corner sounds player, starts the timer (time-lapsed) |
| 0:34 | Focus Mode: the browser expands into the full-screen timer, "Focusing on" the chosen goal |
| 0:40 | Insights: Overview stats and Category Insights, then Advanced Analytics → Pomodoro Heatmap |
| 0:48 | Reminders: the browser notification (Done / Snooze 5 min) and the bell panel's "Needs response" card |
| 0:52 | Concept Cards: "Bring it to mind, then reveal", then graded "Good" |
| 0:57 | Themes: gear menu → Theme Switcher, the Live Theme Preview panel switches Purple → Forest → Rose → Glass |
| 1:06 | Privacy: local-first, no trackers, optional end-to-end encrypted sync |
| 1:11 | Call to action: the cursor clicks "Add to Chrome", then cuewise.app |

Every scene mirrors the current app UI and copy (checked against the running dev server), so the video
never shows a feature that isn't shipped. When the app's UI changes, update the matching scene.

The video is code. `composition.html` holds the scenes and a hand-built HTML recreation of the app
(1440×810 design space). `window.promo.seek(t)` sets every element for time `t`: typed text, checked
goals, timer, camera zoom, cursor, theme colours. So each frame is deterministic. `render.mts` steps
through it frame by frame in headless Chromium and pipes the frames into ffmpeg. `music.mts`
synthesizes an ambient pad, a chime on each scene cut, and the UI clicks, keystrokes and whooshes
listed in `window.promo.sfx`, so there are no licensing questions. Backdrops are generated SVG
landscapes, and fonts load from `@fontsource`, so rendering works offline.

## Render

From `apps/website`, with an ffmpeg that has libx264 on `PATH` (or `FFMPEG=/path/to/ffmpeg`):

```bash
pnpm promo                     # → promo/out/cuewise-promo.mp4
pnpm promo --still 20          # one frame → promo/out/still-20.png
pnpm promo --from 17 --to 23   # render a slice
pnpm promo --fps 60
```

`CHROMIUM_PATH` points it at a specific Chromium if Playwright's bundled one isn't installed.

To preview live, open `composition.html` in a browser. It loops in real time; add `?t=20` to freeze
on one frame.

`out/` is gitignored, like `store-assets/`. Rendered videos are regenerable and would bloat history.

## Editing

- **Timeline:** every interaction time lives in the `T` object (clicks, typing, page changes, theme
  switches). `MOVES` is the cursor path: `[start, arrive, target]`, where a target is an element id,
  `{ a: [x, y] }` in app coordinates or `{ s: [x, y] }` in stage pixels. `CLICKS` drives the press
  and ripple.
- **Camera:** `CAMERA` keys are `[time, zoom, focus]`. The focus is an element id or `'center'`.
- **Captions:** `CAPTIONS` sets the left-hand copy for each beat.
- **Scenes:** each `<section class="scene">` has `data-start` / `data-end` in seconds. Elements with
  `data-fx="up|left|drop|pop|scale|word"` animate in `data-at` seconds after their scene starts.
