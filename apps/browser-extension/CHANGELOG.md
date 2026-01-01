# @cuewise/browser-extension

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
