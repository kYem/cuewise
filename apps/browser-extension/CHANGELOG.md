# @cuewise/browser-extension

## 1.23.0

### Minor Changes

- 9c2e322: Cloud Sync is faster and less silent. Edits now reach your other devices in seconds rather than up to ten minutes, and an edit made while a sync was running is no longer dropped. The quick menu shows your account, when it last synced, and a sync button. Sync now warns you when an account has no recovery code or a sign-in has lost authorisation, instead of looking fine. And a setup that fails after your account has been created now hands you the recovery code it made rather than discarding it — without that code, the account it left behind could never be opened again.

### Patch Changes

- Updated dependencies [9c2e322]
  - @cuewise/app@1.21.0
  - @cuewise/sync-engine@0.2.0
  - @cuewise/sync-client@0.1.7

## 1.22.0

### Minor Changes

- Colour release: the Pomodoro page follows your theme instead of always showing a photo, hover and placeholder colours start working throughout the app, the background controls get a Settings section of their own, and an edit made on one device stops being reverted by another.

### Patch Changes

- 8b5d67c: The Pomodoro page now follows your colour theme. It was showing a scenic photo on every theme — including Purple, Forest and Rose, where the rest of Cuewise uses your theme's own colours — so picking a plain theme gave you a clean home page and then a full photo the moment you opened the timer. The photo belongs to the Glass theme. On the other themes the timer, the agenda beside it, the music player and the page header now use your theme's colours instead of the white-on-dark styling they needed over a photo — so they stay readable in light mode. Focus mode still shows the photo whichever theme you use, since that's the point of it.

  Three things in the music player start working along the way: the pulsing dot that marks something as playing, the tint behind the ambient sound icon, and the play button's filled state while something is playing. All three were written against a colour Cuewise doesn't define, so they had quietly never rendered at all.

  Elsewhere in the same corners: the page header's navigation tabs and Back button get their hover colour back, the "now" marker in the agenda becomes visible again, and the timer's progress ring and session dots keep enough contrast to read on a light page.

  Two quieter repairs. The Pomodoro page was painting its own copy of the Glass wallpaper on top of the one Cuewise already draws behind every page, so the photo was dimmed and blurred twice over and the readability sliders bit harder there than anywhere else — the Pomodoro page now shows the same photo, at the same strength, as the rest of the app. And focus mode keeps the day's photo instead of picking a new one each time you enter it.

- The background photo, your own image and the readability sliders now have a **Background** section of their own in Settings, instead of sitting under Focus mode. They were never controlled by the Focus mode switch — turning it off left them exactly as they were — and they set the wallpaper you see on the Glass theme, not just the one in focus mode. Focus mode now holds only the things it actually turns on.

  Searching your settings also lands you on a control instead of a blank panel. Words like "format", "breaks", "digital" and "custom" matched a section but nothing inside it, so the section opened empty — and the settings they describe live behind a switch that was turned off, which is exactly when you'd be searching for them. Those searches now land on the switch that reveals them.

- b35aca6: Fix goals, quotes and reminders edited on one device being reverted on another. A page that was already open never learned that a sync pull had changed its data, so the next edit made there saved its own stale copy over what arrived — losing a completed task, a changed due date or an added subtask, in either direction. Open pages now pick up changes as they land.

  Also stop a goal, reminder or collection list that cannot be read from being reported as an empty one. Those lists are saved back whole, so a read that failed mid-session could turn into an empty list being saved over real data and synced everywhere. A failed read is now refused, the way quotes already were.

- 028b733: Hover and placeholder colours around the app start working. Buttons, tabs and links that were meant to brighten as your pointer passes over them had been sitting still, and text you haven't typed yet — search boxes, the quote editor, the goal field — was showing in the browser's own grey rather than your theme's. Both were written correctly; the styling behind them had never been generated.

  The sound panel gets its colour back too: the selected soundscape, the active tab and the "Add" button were all painted in a highlight colour Cuewise never actually defined, so a picked soundscape looked the same as an unpicked one. Each theme's highlight is now the deeper shade of its own colour — violet for Purple, green for Forest, rose for Rose, and a brighter white for Glass.

- Updated dependencies
- Updated dependencies [8b5d67c]
- Updated dependencies
- Updated dependencies [b35aca6]
- Updated dependencies [028b733]
  - @cuewise/app@1.20.0
  - @cuewise/storage@1.22.0
  - @cuewise/sync-engine@0.1.7

## 1.21.0

### Minor Changes

- Reliability release: settings stored one at a time so two devices can no longer overwrite each other, a Cloud Sync panel that says plainly when sync isn't working instead of showing a healthy one, fixes for several ways your quotes, calendar and exports could change behind you, and **C** on the new tab to swap between your quote and a concept card that's due.

### Patch Changes

- Cloud Sync now tells you when it isn't working. A sync that fails no longer shows as active with a fresh "Last synced" time, and "Sync now" always reports what actually happened, on both the extension and the Mac app, instead of reporting success for a sync that didn't complete. When something goes wrong you'll see what kind of problem it is — offline, a problem on our side, or something on this device — with your account details and controls still available. A device that can't read its encryption key asks for your recovery code instead of saying your sign-in expired, and stops retrying a sync it cannot complete. When Cuewise can't tell you whether this device synced recently, it says so rather than showing nothing.

  Disconnecting Cloud Sync now stops a sync already in progress. Previously a sync that was mid-download kept writing the disconnected account's goals, quotes and settings onto this device, and could leave behind a bookmark that made the next connection silently skip everything before it. Connecting now always starts from a clean bookmark, so a reconnect can no longer inherit one from a different account. Disconnecting while Cloud Sync is still setting up undoes what setup had started, rather than finishing behind you and switching itself back on — and if it had already created your account, it still shows you the recovery code, which is the only way back into it.

- Press **C** on the new tab to swap between your quote and a concept card that's due for review, in either direction. Until now a card only appeared when the rotation decided to show one, and the only way back to a quote was to grade it. Your surfacing and cadence settings still work exactly as before — the key just lets you reach either one when you want it. Holding **C** swaps once rather than flickering between the two while the key is down, and the shortcut stays out of the way while you're typing, when a dialog is open, or while the welcome screen is up.
- cd561f9: The photographer credit now appears in a small panel above the background credit rather than expanding the line itself, so the "new background" button no longer jumps sideways on hover. The panel stays up long enough to click through to the photographer and Unsplash.
- c011261: Play, pause, stop and playlist changes made in one tab now reach the tab that is actually playing the music. Only one tab drives YouTube playback, and the others were updating their own controls without ever telling it — so pressing play in a second tab showed "playing" and stayed silent. Ambient sounds still play from whichever tab you started them in, and now stop there when you stop them from any tab.
- Fix several ways your data could quietly change behind you. Favouriting a quote could leave an older, unreadable copy of it behind, and that copy could then win on your other devices — the favourited version now replaces it everywhere. If moving your quote library to its new home was interrupted, retrying could overwrite quotes added since; the retry now merges instead, and if Cuewise cannot clear the old storage afterwards it empties it rather than leaving a copy that could bring back a quote you deleted. When Cuewise cannot read some cached calendar events, it refetches your agenda instead of showing the gaps as your real schedule for the rest of the day. A backup now includes quotes you only favourited or hid, which a "complete" export was leaving out.

  Importing a file that uses a category or session type this version does not recognise now tells you it was re-filed, rather than changing your data silently — and says so once per kind ("12 quotes had unrecognised categories…") instead of once per row, with the list capped at five and a count of the rest, so the Import button stays where you can reach it.

  Cuewise also checks its own saved data before showing it. If a note, goal or setting on your device ever ends up in a shape this version cannot read — after a downgrade, or a sync from a newer device — that one item is skipped instead of breaking the page, and a stored list containing a corrupt row no longer stops the whole list being read. Nothing else is touched, and anything a newer version added is left exactly as it was.

- Settings are now stored one at a time rather than as a single record. Changing a setting on one device can no longer overwrite a change arriving from another, and settings you have never touched follow Cuewise's defaults, so improvements to those defaults reach you instead of being frozen at whatever they were when you first changed something. Turning on cloud sync is the exception: it uploads your settings in full so every device starts from the same place, which fixes them at their current values from then on.

  This also fixes settings that could silently revert. Changing two settings in quick succession — nudging a slider while flipping a toggle — could quietly undo the first change, in the moment and on disk. Quote filter preferences were saved by a separate path that never reached cloud sync, so they stayed on one device; they now sync like every other preference. Settings survive a change arriving from another device mid-edit, and a setting changed on another device now appears straight away — the open page used to keep showing the old values until you changed something else or reloaded, so a theme you picked on your laptop looked like it hadn't arrived. If storage is full, saving a setting says so instead of appearing to succeed.

- Updated dependencies
- Updated dependencies
- Updated dependencies [cd561f9]
- Updated dependencies [c011261]
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @cuewise/app@1.19.0
  - @cuewise/shared@1.21.0
  - @cuewise/storage@1.21.0
  - @cuewise/ui@1.21.0
  - @cuewise/sync-client@0.1.6
  - @cuewise/sync-engine@0.1.6

## 1.20.0

### Minor Changes

- b96a7ae: See the weather on your new tab — current conditions and the rest of today's forecast, from a city you pick yourself. Off until you turn it on, no location permission ever requested, and requests go through Cuewise's own proxy so your browser never talks to a weather company.

### Patch Changes

- Updated dependencies [b96a7ae]
  - @cuewise/app@1.18.0
  - @cuewise/shared@1.20.0
  - @cuewise/storage@1.20.0
  - @cuewise/ui@1.20.0
  - @cuewise/sync-client@0.1.5
  - @cuewise/sync-engine@0.1.5

## 1.19.0

### Minor Changes

- Background overhaul release: instant new-tab reveal even when the photo CDN stalls, dim/blur readability sliders, a near-doubled wallpaper collection with verified photographer credits, and a location-first credit line.

### Patch Changes

- 00997df: Keep the photo credit and its "new background" button on the home and Pomodoro pages, where the background is the point. Goals, Quotes, Insights and Concepts no longer have it sitting over their content in the bottom-left corner.
- 62e6a93: Dim and blur sliders for the background image, so your quote and goals stay readable over any photo — including your own.
- d5cd0b3: Fix a new tab that could stay stuck on "Brewing your view…" indefinitely when the background image host was slow or blocked. The page now appears promptly and the photo fades in when it arrives.
- ad4039b: The background credit now leads with where the photo was taken ("Ciucaș Peak, Romania"), with the photographer credit revealed on hover or keyboard focus; photos without a place tag keep the visible byline.
- a89fed0: Nearly double the background wallpaper collection (115 photos, 15–20 per category), every one now crediting its photographer by name — plus removal of two dead images and one miscategorized photo that had been shipping broken.
- Updated dependencies [00997df]
- Updated dependencies [62e6a93]
- Updated dependencies [d5cd0b3]
- Updated dependencies [ad4039b]
- Updated dependencies
- Updated dependencies [a89fed0]
  - @cuewise/app@1.17.0
  - @cuewise/shared@1.19.0
  - @cuewise/storage@1.19.0
  - @cuewise/ui@1.19.0
  - @cuewise/sync-client@0.1.4
  - @cuewise/sync-engine@0.1.4

## 1.18.0

### Minor Changes

- Optional Cloud Sync is now available: sign in to sync your goals, quotes, reminders, and settings across devices. Your data is end-to-end encrypted on your device before it leaves — the server only ever stores ciphertext it cannot read. Off by default; Cuewise stays fully local until you turn it on.

### Patch Changes

- 0559dd2: Credit the Unsplash photo behind the glass theme and add a "New background" control to swap it without waiting for tomorrow
- 328ff4a: Use your own picture as the background — stored on your device, never uploaded.
- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0
  - @cuewise/storage@1.18.0
  - @cuewise/ui@1.18.0
  - @cuewise/app@1.16.2
  - @cuewise/sync-client@0.1.3
  - @cuewise/sync-engine@0.1.3

## 1.17.1

### Patch Changes

- The seeded Pomodoro-music playlists now lead with a CueWise-owned Deep Focus playlist, replacing the broken third-party Lofi Hip Hop default whose first video was removed (grey tile, dead embed). The old third-party Deep Focus entry is gone too; a saved Deep Focus selection rolls onto the new playlist automatically.
- Updated dependencies
  - @cuewise/shared@1.17.1
  - @cuewise/app@1.16.1
  - @cuewise/storage@1.17.1
  - @cuewise/sync-client@0.1.2
  - @cuewise/sync-engine@0.1.2
  - @cuewise/ui@1.17.1

## 1.17.0

### Minor Changes

- 374d7a8: Tasks now roll into Today automatically when their due date arrives. Incomplete tasks whose deadline is today or earlier move into the Today list on load and at midnight (including when the machine wakes past midnight), instead of waiting for a manual transfer (tasks you've deliberately scheduled for a future day stay put). A new "Auto-roll due tasks" toggle in goal settings turns it off; manual transfer counts are unaffected.

### Patch Changes

- e83d0b1: Goal edits and data imports now surface storage write failures instead of silently reverting. When a write fails (e.g. storage quota), editing, linking, adding, deleting, transferring, or re-dating a task shows an error toast and keeps the previous state, rather than displaying a change that would vanish on the next reload. Imports no longer report "Successfully imported" when the write never landed — a quota failure now shows the storage-full message and honest partial counts.
- Updated dependencies [374d7a8]
- Updated dependencies [e83d0b1]
- Updated dependencies [2169ac2]
  - @cuewise/app@1.16.0
  - @cuewise/shared@1.17.0
  - @cuewise/storage@1.17.0
  - @cuewise/sync-client@0.1.1
  - @cuewise/sync-engine@0.1.1
  - @cuewise/ui@1.17.0

## 1.16.0

### Minor Changes

- d095d6a: feat(concepts): starter packs — seed your deck from ten curated topic templates (study skills, cognitive biases, personal finance, geography, history, biology, computer science, machine learning, literary devices, grammar) straight from the Concepts page. Imported cards are due right away, join the spaced-review rotation, and packs you already own show as added (with an "Add new" partial state).
- feat(focus): a "Focusing on" line under the focus-mode timer shows your next Today's Focus task with a progress count ("2 of 3"), and ticking its circle completes the task and advances to the next — no need to leave focus. Hidden when there's nothing to do; toggleable via the new "Show current goal" setting next to "Show quote".
- 3b6ddd3: feat(pomodoro): pop the timer out into a floating, always-on-top mini window that stays visible while you work in other tabs. A pop-out button on the active-timer pill and the Pomodoro page opens a compact Document Picture-in-Picture float showing the session type, countdown, and pause/resume — it keeps ticking and shares state with the app, and survives navigating between Cuewise's own pages. The button is hidden on browsers without the Document PiP API.

### Patch Changes

- 2d2aede: fix(background): the glass-theme daily background now recovers from a removed/404 Unsplash image instead of getting stuck on the dark fallback. The daily background is verified to load before it's cached or persisted, and a dead stored image is replaced with a fresh working one. Also drops an aurora photo Unsplash has removed.
- fix(goals): editing-row link picker fixes — the picker no longer springs open uninvited the next time you edit a task after committing with Enter while it was open, a failed link now keeps the picker open so you can retry (instead of closing while the toast says "try again"), and the edit inputs gained accessible names.
- fix(pomodoro): the timer now reconciles against the wall clock instead of counting ticks, so backgrounded/throttled tabs no longer run the timer slow.
- 17e5eac: fix(reminders): wrap long habit-pill text instead of overflowing — the label now wraps within the pill (which grows to fit) while the cadence/paused tag stays fixed, so long reminder names are no longer clipped.
- fix(sounds): YouTube playback recovers from per-track errors instead of stalling — a playlist track that can't be embedded (owner disabled it, removed, or private) auto-skips to the next track.
- Updated dependencies [c81b692]
  - @cuewise/ui@1.16.0
  - @cuewise/app@1.15.1

## 1.15.0

### Minor Changes

- d08c969: feat(glass): opt-in "Enhanced glass" for richer frosted surfaces

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

- 267717b: feat(pomodoro): tap any timer value to open a compact mini-settings popover with one-tap rhythm presets (Classic, Deep work 50/10, Quick sprint) and inline duration editing — no trip to Settings. Pomodoro durations are now clamped to valid ranges whenever settings are saved (shared `POMODORO_DURATION_BOUNDS` + `clampPomodoroDurations`).

### Patch Changes

- Updated dependencies [d08c969]
- Updated dependencies [267717b]
  - @cuewise/shared@1.15.0
  - @cuewise/storage@1.15.0
  - @cuewise/ui@1.15.0

## 1.14.0

### Minor Changes

- 36db2a1: Add **Concept Cards** — spaced-repetition learning on the new tab. Save a term and its definition (e.g. "Saga pattern") and the new tab resurfaces due cards with active recall: see the term, reveal the answer, then grade it Again / Good / Easy on a simplified SM-2 schedule (with Anki-style 1/2/3 keyboard shortcuts). Cards blend into the quote rotation — a calm "ambient" nudge by default or an explicit "due queue", at a configurable cadence — and a freshly-added due card joins the rotation right away.

  The recall card has a bottom-dock toolbar to browse the due queue (prev · reveal-then-next ring · next), favorite a card, see the due count, and add a concept. The add/edit editor is a two-column form with a live preview of how the card will surface, a tag chip input with suggestions, a searchable source field, character counts, and a delete action.

  Manage your deck from the new **Concepts** page (search, filter by tag, and a left-edge tint showing each card's difficulty), and track progress on the Insights **Concepts** tab — cards due now, the new / learning / mastered split, a retention measure, average ease, a 7-day due forecast, and which cards need attention — with a due-count badge on the nav. Tune everything under Settings → Concept cards; a gentle one-time nudge invites engaged users to try it. Private and local, like the rest of Cuewise.

- 94c3c9b: feat(new tab): show the calendar alongside goals via a toggle

  The home new-tab "Today's Focus" menu gains a **Calendar** toggle: goals always
  show (with their Full / Compact / Focus density), and turning the toggle on
  stacks the Google Calendar "Up next" strip above or below them. The toggle only
  appears when the integration is provisioned.
  - new `newTabShowCalendar` boolean setting (default off); `goalViewMode` stays
    purely goals density
  - a `newTabCalendarPosition` (`above | below`, default `below`) control — an
    up/down arrow on the same toggle row — orders the calendar when it's on
  - `GoalsSection` stacks the goals + calendar blocks ordered by position
  - reuses the existing `CalendarStrip` + calendar store; lazy-inits calendar only
    when the calendar block is shown
  - `CalendarStrip` gains a `variant`: the home page uses a theme-token `surface`
    variant (readable on light themes), while the Pomodoro companion keeps the
    white-on-dark `overlay` look on its image background

- 94c3c9b: feat(pomodoro): google calendar "up next" companion (ENG-13)

  Beside the Pomodoro timer you can now show a quote, a Google Calendar agenda, or
  both, chosen via a Quote/Calendar/Both control in Timer settings.
  - new `pomodoroCompanion` setting (quote | calendar | both, default quote)
  - `CalendarStrip` with connect / loading / empty / event-list states + a lean
    "Up next" mode for the stacked Calendar + Quote layout
  - read-only Google Calendar sync via `chrome.identity` + the Calendar API
    (`calendar.readonly`), entirely client-side — no Cuewise backend involved
  - `identity` and the Google API hosts are **optional** permissions (opt-in):
    requested only when the user clicks Connect and released on disconnect, so a
    user who never enables the calendar grants nothing Google-related at install
  - no sample/preview data: the strip shows the Connect prompt until a real Google
    Calendar connection succeeds. An un-provisioned build (no OAuth client id)
    hides the companion entirely rather than fabricating events

  Setup for the OAuth client id is documented in
  `apps/browser-extension/GOOGLE_CALENDAR.md`.

- 9ba7be9: Add a Quick Links widget to the new tab: pin shortcut tiles next to the goals button (top-left), showing up to three favicon icons with a "more" overflow dropdown to add, edit, remove, and reach additional links. Favicons load locally via Chrome's favicon API — no network calls, in keeping with the privacy-first design. Toggle it under Settings → Home page.

### Patch Changes

- Updated dependencies [36db2a1]
- Updated dependencies [94c3c9b]
- Updated dependencies [94c3c9b]
- Updated dependencies [9ba7be9]
  - @cuewise/shared@1.14.0
  - @cuewise/storage@1.14.0
  - @cuewise/ui@1.14.0

## 1.13.0

### Minor Changes

- 1d6f2a8: Redesign the reminders panel with two selectable layouts, replacing the cramped
  single-panel view. A new "Reminders layout" setting (Settings → Goals & alerts)
  switches between:
  - **Composed** (default) — an ambient habits strip for interval reminders
    (tap to mark done) plus a scheduled timeline, with the one consequential
    overdue item shown as a "Needs response" hero card.
  - **Agenda** — a single time rail grouped by urgency (Needs response / Overdue /
    Up next / Scheduled), each row a category-icon node that doubles as the
    complete button.

  Both layouts add a distinct "Needs response" state (the alarm fired and is
  awaiting you), category accents, live countdowns, 12h/24h-aware times, and a
  roomier layout — launched from the same bottom-right Alerts bell, with the same
  Add / Edit / snooze / pause-resume actions, adapting to light/dark mode and all
  four themes.

  Also in this release:
  - **Skip an upcoming occurrence.** Checking off a recurring reminder that has
    not fired yet skips that occurrence and advances to the next one — keeping a
    calendar reminder's clock time (tonight 9pm → tomorrow 9pm) — while checking
    off a due or overdue one restarts its cadence from now. The check control
    shows a skip glyph on hover when the click will skip.
  - **Snooze from now**, not from the (possibly past) due date, so snoozing an
    overdue reminder no longer leaves it in the past.
  - **Missed-alarm catch-up** on open, plus an in-page firing fallback when the
    alarms API is unavailable (dev server), so due reminders still surface.
  - A single polished Add/Edit form shared across both flows.
  - Write failures now surface an error instead of falsely reporting success.

### Patch Changes

- 6b17ba3: Polish the goal add/edit form to match the reminders modal: quick-pick due-date chips (Today / Tomorrow / Next week / In 2 weeks), a dark-mode-aware date input, and a relative due-date preview. The goal modals are also more compact (narrower width + tighter spacing) via a new optional `size` prop on the shared Modal.
- 9d401dd: Reminders: if a reminder saves but its alarm can't be scheduled (e.g. the browser's alarm limit), show a distinct "saved, but we couldn't schedule its alert" warning instead of a generic failure — and never revert the saved reminder over a scheduling error.
- 404d76d: Internal: tighten reminder panel prop types — group the view-switcher into one optional object (no dead-switcher state) and give the header sub-note a consistent `tone: ReminderState | null`. No behavior change.
- e7fd59b: Internal type-safety: model `Reminder.recurring` as a discriminated union so an interval cadence always carries `intervalMinutes` and calendar cadences never do — removing defensive fallbacks. No behavior change.
- Updated dependencies [e7fd59b]
  - @cuewise/shared@1.13.0
  - @cuewise/storage@1.13.0
  - @cuewise/ui@1.13.0

## 1.12.0

### Minor Changes

- dd614f4: Replace the goal-completion confetti with a satisfying animated tick checkbox
  - New `AnimatedCheckbox` — a presentational, theme-aware SVG that plays a quick
    ring **spin** and then **draws** the checkmark on when you complete a task,
    with a subtle pop. It tints to the active theme (and a white `onImage` variant
    for the glass theme), respects `prefers-reduced-motion` (the check appears
    instantly, no spin), and never replays the animation for tasks that are
    already complete when they load
  - Adopted across every interactive completion toggle: the Today's Focus tiles,
    backlog rows, and subtasks; the compact rows (the flag pill is now the standard
    animated ring); the focus-mode check; the all-goals list; upcoming tasks; and
    the goal detail task rows (which also gain a previously-missing accessible
    label)
  - Removed the "all goals done" confetti celebration in favour of the per-checkbox
    tick — completing your last task of the day no longer triggers a random burst.
    The Pomodoro-completion confetti and the `celebrationsEnabled` setting are
    unchanged

- 26e1c04: Add a movement-break reminder: a recurring "time to move" notification on a
  custom "every N minutes" interval (presets 30/45/60/90 + custom, default 30),
  with a one-tap "Move" preset, Done / Snooze-5-min notification buttons, and a
  pause/resume toggle for recurring reminders. Inspired by the NPR _Body Electric_
  "move every 30 minutes" study.
- 56a8451: Redesign the Pomodoro timer into a compact, on-brand card with a goal-picker header
  - **Compact card** — smaller ring, digits, and controls, with a density-aware
    width (compact / comfortable / spacious)
  - **The header is the goal picker** — the title shows the chosen goal or the
    session label ("Focus Session"); a chevron opens a dropdown of today's
    incomplete goals with an in-list "Clear goal" option, and it closes on
    click-outside. A long goal title shrinks to fit two lines, then fades at the
    bottom edge instead of hard-truncating
  - **Settings as a compact icon row** — ⏱ focus · ☕ break · 🛏 long break ·
    ↻ interval; each value opens its preset menu in a single click (no more bulky
    inline select), and the active-sound line uses a Lucide icon instead of an emoji
  - The "until long break" session dots now sit just below the ring

### Patch Changes

- e4246e5: Fix the goal add-row "link to goal" button and show the Cuewise logo on the welcome screen
  - The link button in the Today's Focus add-row did nothing: it's rendered via
    Radix `PopoverTrigger asChild`, but `GoalLinkButton` was a plain function
    component that didn't forward the trigger's ref/onClick to its `<button>`, so
    the picker never opened. It now uses `forwardRef` and spreads the trigger props.
  - The welcome modal showed a generic sparkles icon; it now shows the actual
    Cuewise logo.

- a9ad3e7: Add a `release:status` script that reports the Chrome Web Store published vs.
  last-uploaded version (compared to package.json), so you can tell whether the
  latest release is live or still in review. Dependency-free, same credentials as
  `publish:chrome`.

## 1.11.0

### Minor Changes

- 9b1712d: Redesign the Today's Focus goals widget to match the design system (full, compact, and focus views)
  - **Full view** leads with a progress ring + encouragement line; soft pill rows
    with the subtask `n/m` count on the right that expands the subtasks inline; the
    add-a-goal input moved to the bottom of the card
  - **Compact view** is now slim glanceable rows: flag/check pill, an inline subtask
    progress bar, and an accordion chevron
  - A single ⚙ menu consolidates the view-mode switcher (Full / Compact / Focus) and
    the **Show completed / Show incomplete / Upcoming** toggles, replacing the old
    header trio and in-card buttons
  - Subtask management (add / remove / reorder) is edit-mode only; the drag handle
    appears only while editing
  - New persisted settings — `showCompletedGoals` (default on), `showIncompleteGoals`,
    and `showUpcomingGoals` — so the toggles survive reload
  - Removed the standalone progress bar and the "Clear completed" button (the ring
    and the show-completed filter cover them)

- 89252ee: Add a gentle in-app store-review prompt (ENG-3)

  Surfaces a dismissible "Enjoying Cuewise?" modal at a moment of delight — a 7-day
  goal streak or 10 completed pomodoros — at a calm tab-open moment (never on
  install, never during an active pomodoro). It's shown at most twice, spaced a
  week apart; "Leave a review" opens the Chrome Web Store reviews tab and "Don't
  ask again" stops it permanently. The trigger lives in a pure, unit-tested
  `shouldShowReviewPrompt` helper, backed by three new persisted settings
  (`reviewPromptDismissed`, `reviewPromptCount`, `reviewPromptLastShownAt`).

### Patch Changes

- 67b7b3a: Fix the compact "Today's Focus" widget: add-row overflow, dead empty state, and
  inert menu toggles
  - The compact add-row rendered the boxed input variant, whose `min-w-[280px]`
    plus the wide Add button overflowed the 400px card — truncating the placeholder
    and clipping the "Add" button off the right edge. It now uses the soft-pill
    `widget` variant that fits.
  - Completing every task with "Show completed" off left a dead widget with no way
    to add a task (the add-row only appeared when there were literally zero tasks).
    The add-row now shows whenever the visible list is empty.
  - The compact menu's "Show incomplete" and "Upcoming" toggles did nothing — those
    sections were full-mode only. They now render in compact too, so the toggles
    are meaningful in both views.

- 89252ee: Fix the current streak collapsing to zero when a completed goal carries a future
  date

  `calculateStreak` is anchored to today, so a completed objective whose date is a
  future due-date sorted ahead of today and reset the current streak to 0 — most
  visibly on the Insights page. The streak now ignores future-dated entries at the
  shared-utility level, so every caller (Insights and the new review prompt) stays
  correct.

## 1.10.0

### Minor Changes

- 784ed5e: Redesign the settings modal into a compact, theme-aware sidebar layout
  - Six sidebar categories (Timer, Sound & music, Focus mode, Home screen,
    Goals & alerts, Advanced) replace the long single-scroll list
  - Instant-save with a quiet "saved" footer indicator — no more Save button;
    reset is a two-tap confirm under Advanced
  - Denser controls: session-recipe presets, steppers, segmented controls,
    chips, and a background thumbnail picker, with inline helper text
  - Search filters settings across every category
  - Debug log level and Chrome sync demoted under Advanced
  - Adapts across all four color themes; full parity with the existing settings

## 1.9.1

### Patch Changes

- b6719ff: Refresh Chrome Web Store listing metadata and default to the glass theme
  - Store title is now "Cuewise: New Tab Quotes, Goals & Pomodoro Timer"
    (keyword-rich for store search, 47 chars per ASO guidance), with
    `short_name` "Cuewise" so browser UI surfaces keep the short name
  - Store search summary rewritten around the queries people actually use
    (new tab, motivational quotes, to-do goals, Pomodoro timer, focus mode)
  - Detailed store description (DESCRIPTION.md) rewritten for the v1.9 feature
    set — subtasks, due dates, reordering, collections, CSV import, focus mode,
    soundscapes — and the stale FAQ corrected (data export shipped, optional
    Chrome sync)
  - New installs now default to the glass color theme; existing users keep
    their saved theme

- Updated dependencies [b6719ff]
  - @cuewise/shared@1.9.1
  - @cuewise/storage@1.9.1
  - @cuewise/ui@1.9.1

## 1.9.0

### Minor Changes

- a403b84: Add CSV bulk quote import feature
  - Import quotes from CSV files with drag & drop or file picker
  - CSV parsing with support for quoted fields, escaped quotes, and commas
  - Validation with clear error messages for invalid rows
  - Optional collection assignment for imported quotes
  - Download CSV template with all valid categories listed
  - Comprehensive test coverage for CSV parsing utilities

- c8b9d8c: Persist quote filter settings across browser sessions
  - Remember enabled categories, custom quotes toggle, favorites-only mode
  - Remember active collection filters
  - Filter out deleted collection IDs on load
  - Show warning toast if filter preferences fail to save
  - Persist filter state when deleting collections

- 541153e: Add quote collections feature for organizing quotes into themed groups
  - Create custom collections with name and description
  - Add individual quotes to collections via CollectionPicker popover
  - Bulk add multiple quotes to a collection
  - View and manage collections in Quote Management page (new Collections tab)
  - Filter quotes by active collection
  - Collection count badges on quote cards
  - Full CRUD operations for collections

- 04e9997: Auto-complete a task when all its subtasks are done

  Checking the last open subtask now marks the parent task complete, and
  unchecking a subtask reopens it — a task with subtasks is complete exactly when
  all of them are. Completing the task directly (via its own checkbox) is still
  allowed.

- 6eddbc7: Add task enhancements: subtasks, due dates, reordering, duplication, and an upcoming-tasks view
  - **Subtasks**: add a checklist to any task with add / toggle / remove and a progress indicator
  - **Due dates**: set a per-task due date with a picker; a badge shows the relative day and overdue tasks are highlighted red
  - **Drag-to-reorder**: reorder Today's Focus tasks via a drag handle (keyboard-accessible); order is persisted
  - **Duplicate**: one-click duplicate of a task (copies subtasks and due date, reset to incomplete)
  - **Upcoming**: a collapsible "Upcoming" section on the home list and the Goals page surfaces tasks due within the next 14 days, with inline complete and "move to today"

### Patch Changes

- 585c03b: Replace the placeholder extension icon with the violet "Cue Dot" brand mark

  The toolbar, store, and notification icon now use the cohesive violet "Cue Dot"
  logo (an open ring + dot reading as a C), matching the app's violet UI. The
  previous icon was an off-brand green/coral mark that clashed with the product's
  visual identity.

- 7e8a70f: Fix focus mode lingering on a completed task

  Focus mode now shows the "All done" screen once every task is complete, and
  advances to the next open task — even when the focused task was completed from
  another view. Previously a now-completed focused task stayed on screen
  (struck-through) instead of advancing or celebrating.

- a0463c2: Surface task features in compact and focus view modes
  - **Compact** Today's Focus now shows **subtasks** (progress + add/toggle/remove),
    matching full view (it already had due dates, reorder, and duplicate).
  - **Focus** mode now shows read-only **due-date** and **subtask progress**
    indicators on the focused task, while staying distraction-free (no
    editing/reorder/duplicate controls).

- Updated dependencies [a403b84]
- Updated dependencies [c8b9d8c]
- Updated dependencies [541153e]
- Updated dependencies [04e9997]
- Updated dependencies [6eddbc7]
  - @cuewise/shared@1.9.0
  - @cuewise/storage@1.9.0
  - @cuewise/ui@1.9.0

## 1.8.0

### Minor Changes

- ea2b22f: ## New Features

  ### Configurable Quote Display Mode
  - Add quote display mode setting with four options:
    - **Normal** - Quote displayed at top with full controls
    - **Compact** - Minimized quote display at top
    - **Bottom** - Quote fixed at bottom of screen
    - **Hidden** - Quote completely hidden for distraction-free view

  ### Focus Position Setting
  - Add vertical position setting for goals/focus section when quote is at bottom or hidden
  - Choose between Top, Center, or Bottom alignment
  - Allows customization of workspace layout based on preference

  ### "Add Another" Button in Focus View
  - Add "Add another" button when all tasks are completed in focus/glass mode
  - Allows quickly adding new tasks without switching to full goals view
  - Input auto-focuses when clicking the button for immediate typing

  ## Improvements
  - Show parent objective on hover in focus mode for linked tasks
  - Persist daily background image for glass theme

- 0c8b323: ## Smart Ticker Animation

  Add slot-machine style animation for author name and category badge when quotes change, using the `@tombcato/smart-ticker` library.

  ### Features
  - **Animated category badge**: Category name scrolls through characters when transitioning
  - **Animated author name**: Author name uses slot-machine animation on quote changes
  - **Settings toggle**: Enable/disable animation via Settings → Quote Change Interval → "Animate quote transitions"
  - **Disabled by default**: Animation is opt-in to avoid CPU usage on lower-end devices

  ### New Components
  - `AuthorTicker`: Animated author name display with character-level scrolling
  - `CategoryTicker`: Animated category badge with smooth transitions

  ### Settings
  - Added `enableQuoteAnimation` setting (default: `false`)
  - Animation only affects category badge and author name, not the quote text itself

- e2f24c1: ## Goals Section View Modes

  Add three view modes for the Today's Focus section, allowing users to customize how their daily goals are displayed:
  - **Full mode**: Complete view with input field, progress bar, task list, and incomplete section
  - **Compact mode**: Minimal task list with edit controls only - perfect for users who want less visual clutter
  - **Focus mode**: Single task display without container wrapper, designed for glass theme compatibility

  ### Focus Mode Features
  - Settings popover for switching between modes and selecting which goal to focus on
  - Goal selector only appears when multiple tasks exist
  - Seamless integration with glass theme (no container wrapper)
  - View mode preference persists across sessions via Chrome storage

  ### UI Improvements
  - Compact quote controls with uniform button sizing
  - Circular progress ring around refresh button showing countdown to next quote
  - Improved popover/dropdown visibility with frosted glass background (95% opacity + backdrop blur)
  - Fixed reminders panel positioning to open above the bell button without overlapping

  ### Technical Changes
  - Added `GoalViewMode` type (`'full' | 'compact' | 'focus'`) to shared types
  - Added `goalViewMode` and `focusedGoalId` settings for persistence
  - New `GoalFocusView` component for minimal focus display
  - Updated `GoalsSection`, `GoalsList`, `QuoteDisplay`, `CategoryFilter`, `ReminderWidget`, and `SoundsMiniPlayer` components

### Patch Changes

- Updated dependencies [ea2b22f]
- Updated dependencies [0c8b323]
- Updated dependencies [e2f24c1]
  - @cuewise/shared@1.8.0
  - @cuewise/storage@1.8.0
  - @cuewise/ui@1.8.0

## 1.7.0

### Minor Changes

- ## New Features

  ### Glass Theme with Dynamic Backgrounds
  - Add new glass theme with frosted glass effect and dynamic Unsplash background images
  - Improve glass theme loading with animated shimmer indicator

  ### YouTube Music Player for Pomodoro
  - Add embedded YouTube music player for focus sessions
  - Play ambient music, lo-fi beats, or custom playlists during Pomodoro sessions

  ### Customizable Notification Sounds
  - Add customizable notification sounds for Pomodoro timer events
  - Choose from multiple sound options for work/break transitions

  ### Compact Floating Reminder Widget
  - Replace side-by-side reminders panel with compact floating widget in bottom-right corner
  - Show up to 3 priority reminders (overdue first, then upcoming)
  - Add "View all" modal for full reminder list
  - Display live countdown for reminders within 5 minutes of due time
  - Add snooze buttons for approaching reminders

  ### Goals with Link-to-Task Feature
  - Add goals feature with ability to link tasks to goals
  - Rename objectives terminology to goals throughout the app

  ### Storage Quota Error Handling
  - Surface Chrome storage quota errors in frontend with user-friendly messages

  ## Improvements
  - Replace manual click-outside detection with Radix popover component
  - Simplify error handling by re-throwing from stores
  - Add error handling to async event handlers to prevent silent failures
  - Restore move-to-today button for incomplete tasks
  - Center Goals section as full-width after layout change

  ## Fixes
  - Remove footer from new tab page
  - Fix missing await in async event handlers
  - Add error handling to goal form async operations

## 1.6.0

### Minor Changes

- d5ebdd6: Add author autocomplete and streamline quote management
  - Add reusable Autocomplete component to @cuewise/ui with keyboard navigation and accessibility support
  - Add author autocomplete to Add Quote and Edit Quote forms, suggesting existing authors
  - Remove floating "Add Custom Quote" button from home page - quotes can now be added via the dedicated Quote Management page

### Patch Changes

- Updated dependencies [d5ebdd6]
  - @cuewise/ui@1.6.0

## 1.5.0

### Minor Changes

- ## Smart Reminder Templates

  Add pre-built reminder templates for common tasks with context-aware time suggestions:
  - **Health & Wellness**: Drink Water, Stretch Break, Eye Rest, Medication, Exercise
  - **Productivity**: Daily Standup, End of Day Review, Weekly Review
  - **Personal**: Daily Journal, Gratitude

  Templates create reminders instantly with one click, using smart default times based on the reminder type.

  ## Dedicated Goals Page

  New full-page goals view with:
  - Goals history and statistics
  - Filter by date range
  - Visual progress tracking

  ## Quick Reminder Presets
  - Natural language date picker ("tomorrow", "next week")
  - Quick time presets for common scheduling patterns

  ## Favorites Filter
  - Filter quotes by favorites in the category filter dropdown
  - Quick access to your favorite quotes

  ## Fixes
  - Fix template icon visibility in light mode
  - Fix dark mode variant behavior for explicit light mode selection (Tailwind v4 class-based dark mode)
  - Improved error handling with user feedback for reminder operations
  - Template time parsing validation

## 1.4.0

### Minor Changes

- b02da15: Add accessibility improvements
  - Semantic HTML landmarks (`<main>`, `<nav>`, `<header>`) for screen reader navigation
  - Skip-to-main-content link for keyboard users
  - `aria-live` regions for toast notifications and quote changes
  - `prefers-reduced-motion` support to disable animations
  - ARIA attributes for dropdown menus (`aria-expanded`, `aria-haspopup`, `role="menu"`)
  - `aria-current="page"` for active navigation tabs

- 3e219ae: Add bulk quote operations and quote restoration functionality

  ## Bulk Operations
  - Multi-select checkboxes on quote cards in Quote Management page
  - Select all / deselect all for current filtered view
  - Bulk delete, favorite/unfavorite, hide/unhide actions
  - Confirmation dialog for destructive actions

  ## Quote Restoration
  - "Restore Missing Quotes" - adds back deleted default quotes without affecting custom quotes
  - "Reset All Quotes" - completely resets to factory defaults (with confirmation)
  - Accessible via "More Options" dropdown in Quote Management page

  ## New Components
  - ConfirmationDialog - reusable modal for destructive action confirmations
  - BulkActionsToolbar - selection mode toggle and action buttons
  - QuoteRestorationMenu - restore/reset dropdown menu

- Add full-screen Focus Mode with Unsplash background images

  ## Focus Mode Features
  - Full-screen overlay with scenic Unsplash background images
  - Large timer display with play/pause controls
  - Optional motivational quote display during focus sessions
  - Auto-enter focus mode when Pomodoro timer starts (configurable in settings)
  - Escape key to quickly exit focus mode

  ## Background Image System
  - Integration with Unsplash API for high-quality scenic images
  - 10 fallback images per category (nature, water, forest, mountains, sky)
  - Smart image preloading and caching for smooth transitions
  - Random selection with cache-busting to ensure variety

  ## New Components
  - FocusMode - main full-screen overlay component
  - FocusModeTimer - large timer display
  - FocusModeControls - play/pause and exit controls
  - FocusModeQuote - optional quote display
  - BackgroundImage - handles image loading with fallbacks

  ## New Store
  - focus-mode-store - manages focus mode state, image loading, and preloading

### Patch Changes

- 9ac8b71: Improve charts with shadcn/Recharts best practices
  - Add CSS variable injection for theme-aware chart colors
  - Fix tooltip styling for dark mode compatibility
  - Add `hideName` prop to ChartTooltipContent for cleaner tooltips
  - Remove dashed grid lines, use clean horizontal lines
  - Make X-axis labels horizontal and abbreviated
  - Convert weekday chart to vertical bar layout for consistency
  - Add forest and rose theme chart color variants

- c56e23a: Add unique quotes for resilience, leadership, health, and growth categories

  Previously these 4 categories reused quotes from other categories (inspiration, success, mindfulness, learning), resulting in only 60 unique quotes despite generating 100 quote objects. Now all 10 categories have 10 unique quotes each for a total of 100 truly unique quotes.

- Updated dependencies [b02da15]
- Updated dependencies [9ac8b71]
  - @cuewise/ui@1.4.0

## 1.3.0

### Minor Changes

- ### Features
  - Add category filter for quotes with custom quote toggle
  - Add data import functionality with version compatibility checking
  - Add welcome modal for first-time users
  - Add version info to main page footer with changelog link

  ### Improvements
  - Replace console.error/warn/log with centralized logger

## 1.2.0

### Minor Changes

- 8ef3a22: Add version display to settings modal with link to changelog

## 1.1.1

### Patch Changes

- 93f7d82: Fix pomodoro timer display getting stuck on navigation

  When navigating to the Pomodoro page while the timer was actively running, the display would appear stuck showing stale time. The fix detects when the timer is actively being ticked by another component and skips unnecessary state recovery.
