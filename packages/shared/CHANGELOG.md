# @cuewise/shared

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

## 1.13.0

### Patch Changes

- e7fd59b: Internal type-safety: model `Reminder.recurring` as a discriminated union so an interval cadence always carries `intervalMinutes` and calendar cadences never do — removing defensive fallbacks. No behavior change.

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

### Patch Changes

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
