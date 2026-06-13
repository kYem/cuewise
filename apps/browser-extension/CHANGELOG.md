# @cuewise/browser-extension

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
