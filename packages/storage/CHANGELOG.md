# @cuewise/storage

## 1.15.0

### Patch Changes

- Updated dependencies [d08c969]
- Updated dependencies [267717b]
  - @cuewise/shared@1.15.0

## 1.14.0

### Minor Changes

- 36db2a1: Add **Concept Cards** — spaced-repetition learning on the new tab. Save a term and its definition (e.g. "Saga pattern") and the new tab resurfaces due cards with active recall: see the term, reveal the answer, then grade it Again / Good / Easy on a simplified SM-2 schedule (with Anki-style 1/2/3 keyboard shortcuts). Cards blend into the quote rotation — a calm "ambient" nudge by default or an explicit "due queue", at a configurable cadence — and a freshly-added due card joins the rotation right away.

  The recall card has a bottom-dock toolbar to browse the due queue (prev · reveal-then-next ring · next), favorite a card, see the due count, and add a concept. The add/edit editor is a two-column form with a live preview of how the card will surface, a tag chip input with suggestions, a searchable source field, character counts, and a delete action.

  Manage your deck from the new **Concepts** page (search, filter by tag, and a left-edge tint showing each card's difficulty), and track progress on the Insights **Concepts** tab — cards due now, the new / learning / mastered split, a retention measure, average ease, a 7-day due forecast, and which cards need attention — with a due-count badge on the nav. Tune everything under Settings → Concept cards; a gentle one-time nudge invites engaged users to try it. Private and local, like the rest of Cuewise.

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

## 1.13.0

### Patch Changes

- Updated dependencies [e7fd59b]
  - @cuewise/shared@1.13.0

## 1.9.1

### Patch Changes

- Updated dependencies [b6719ff]
  - @cuewise/shared@1.9.1

## 1.9.0

### Minor Changes

- 541153e: Add quote collections feature for organizing quotes into themed groups
  - Create custom collections with name and description
  - Add individual quotes to collections via CollectionPicker popover
  - Bulk add multiple quotes to a collection
  - View and manage collections in Quote Management page (new Collections tab)
  - Filter quotes by active collection
  - Collection count badges on quote cards
  - Full CRUD operations for collections

### Patch Changes

- Updated dependencies [a403b84]
- Updated dependencies [c8b9d8c]
- Updated dependencies [541153e]
- Updated dependencies [04e9997]
- Updated dependencies [6eddbc7]
  - @cuewise/shared@1.9.0

## 1.8.0

### Patch Changes

- Updated dependencies [ea2b22f]
- Updated dependencies [0c8b323]
- Updated dependencies [e2f24c1]
  - @cuewise/shared@1.8.0
