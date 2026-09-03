# @cuewise/app

## 1.23.1

### Patch Changes

- a2e35dc: Requesting a feature no longer needs a GitHub account — Settings now links to a short form on cuewise.app.
- 9786286: The weather popover's hourly strip now rolls into tomorrow instead of emptying out at the end of the day, and a window left open refreshes itself rather than keeping the reading it started with. A reading whose age can no longer be trusted says so and refreshes, instead of claiming it was updated just now — as does the calendar strip when its own last-sync time is unreadable.
- Updated dependencies [a2e35dc]
- Updated dependencies [9786286]
  - @cuewise/shared@1.25.1
  - @cuewise/storage@1.25.1
  - @cuewise/sync-engine@0.3.1
  - @cuewise/ui@1.25.1

## 1.23.0

### Minor Changes

- b215f72: Connect a new device by approving it from one you already have — no recovery code typing; a short code on both screens confirms it's really your device.
- ed14709: Home widgets are now discoverable from the new tab and during onboarding.
- 67744a5: A notes scratchpad on the new tab.

### Patch Changes

- 93c497f: Stop a quote or collection you edit from erasing one that synced in at the same moment, and stop the new tab showing a quote you hid or edited on another device.
- dc30188: Stop Cloud Sync asking the server about your recovery code every five minutes. The extension re-checked it on every background wake — around 288 requests a day — even though the only thing that reads the answer is a banner in the Cloud Sync settings panel. The check now runs when that panel asks for it, and the background one runs only if this device has actually lost its key, which is the case where the answer changes anything.
- 3587c5b: Stop an edit and an incoming sync landing at the same moment from erasing each other, for goals and reminders alike.
- 340e2a5: Device pairing now stops straight away if the other device's key arrives damaged, instead of waiting out the full ten minutes.
- fa44878: Turning the weather widget back on no longer undoes a city you removed or changed at the same moment.
- fa44878: The add-widget panel now stays put while you scroll, is reachable by keyboard, and keeps the weather location control visible after you pick a city.
- 1039e43: Escape no longer ends onboarding while you are typing, Settings lists the same home widgets as the picker, and presets show which one you are on.
- Updated dependencies [93c497f]
- Updated dependencies [b215f72]
- Updated dependencies [2d84067]
- Updated dependencies [7008a7b]
- Updated dependencies [dc30188]
- Updated dependencies [641ac48]
- Updated dependencies [3587c5b]
- Updated dependencies [67744a5]
- Updated dependencies [340e2a5]
  - @cuewise/storage@1.25.0
  - @cuewise/sync-engine@0.3.0
  - @cuewise/shared@1.25.0
  - @cuewise/ui@1.25.0

## 1.22.0

### Minor Changes

- 407c43f: Space now moves the new tab along: it reveals a recall card's answer, and gives you a new quote the rest of the time. The reveal button says so on hover. Grading stays on 1/2/3.

## 1.21.0

### Minor Changes

- 9c2e322: Cloud Sync is faster and less silent. Edits now reach your other devices in seconds rather than up to ten minutes, and an edit made while a sync was running is no longer dropped. The quick menu shows your account, when it last synced, and a sync button. Sync now warns you when an account has no recovery code or a sign-in has lost authorisation, instead of looking fine. And a setup that fails after your account has been created now hands you the recovery code it made rather than discarding it — without that code, the account it left behind could never be opened again.

### Patch Changes

- Updated dependencies [9c2e322]
  - @cuewise/sync-engine@0.2.0

## 1.20.0

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

- Updated dependencies [b35aca6]
  - @cuewise/storage@1.22.0
  - @cuewise/sync-engine@0.1.7

## 1.19.0

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
- Updated dependencies
  - @cuewise/shared@1.21.0
  - @cuewise/storage@1.21.0
  - @cuewise/ui@1.21.0
  - @cuewise/sync-engine@0.1.6

## 1.18.0

### Minor Changes

- b96a7ae: See the weather on your new tab — current conditions and the rest of today's forecast, from a city you pick yourself. Off until you turn it on, no location permission ever requested, and requests go through Cuewise's own proxy so your browser never talks to a weather company.

### Patch Changes

- Updated dependencies [b96a7ae]
  - @cuewise/shared@1.20.0
  - @cuewise/storage@1.20.0
  - @cuewise/ui@1.20.0

## 1.17.0

### Minor Changes

- Background overhaul release: instant new-tab reveal even when the photo CDN stalls, dim/blur readability sliders, a near-doubled wallpaper collection with verified photographer credits, and a location-first credit line.

### Patch Changes

- 00997df: Keep the photo credit and its "new background" button on the home and Pomodoro pages, where the background is the point. Goals, Quotes, Insights and Concepts no longer have it sitting over their content in the bottom-left corner.
- 62e6a93: Dim and blur sliders for the background image, so your quote and goals stay readable over any photo — including your own.
- ad4039b: The background credit now leads with where the photo was taken ("Ciucaș Peak, Romania"), with the photographer credit revealed on hover or keyboard focus; photos without a place tag keep the visible byline.
- a89fed0: Nearly double the background wallpaper collection (115 photos, 15–20 per category), every one now crediting its photographer by name — plus removal of two dead images and one miscategorized photo that had been shipping broken.
- Updated dependencies [62e6a93]
- Updated dependencies [d5cd0b3]
  - @cuewise/shared@1.19.0
  - @cuewise/storage@1.19.0
  - @cuewise/ui@1.19.0

## 1.16.2

### Patch Changes

- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0
  - @cuewise/storage@1.18.0
  - @cuewise/ui@1.18.0

## 1.16.1

### Patch Changes

- Updated dependencies
  - @cuewise/shared@1.17.1
  - @cuewise/storage@1.17.1
  - @cuewise/ui@1.17.1

## 1.16.0

### Minor Changes

- 374d7a8: Tasks now roll into Today automatically when their due date arrives. Incomplete tasks whose deadline is today or earlier move into the Today list on load and at midnight (including when the machine wakes past midnight), instead of waiting for a manual transfer (tasks you've deliberately scheduled for a future day stay put). A new "Auto-roll due tasks" toggle in goal settings turns it off; manual transfer counts are unaffected.

### Patch Changes

- e83d0b1: Goal edits and data imports now surface storage write failures instead of silently reverting. When a write fails (e.g. storage quota), editing, linking, adding, deleting, transferring, or re-dating a task shows an error toast and keeps the previous state, rather than displaying a change that would vanish on the next reload. Imports no longer report "Successfully imported" when the write never landed — a quota failure now shows the storage-full message and honest partial counts.
- Updated dependencies [374d7a8]
- Updated dependencies [2169ac2]
  - @cuewise/shared@1.17.0
  - @cuewise/storage@1.17.0
  - @cuewise/ui@1.17.0

## 1.15.1

### Patch Changes

- Updated dependencies [c81b692]
  - @cuewise/ui@1.16.0
