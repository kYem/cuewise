# @cuewise/shared

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
