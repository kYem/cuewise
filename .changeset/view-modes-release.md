---
"@cuewise/browser-extension": minor
"@cuewise/shared": patch
---

## Goals Section View Modes

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
