# Cuewise Development Roadmap

**Last Updated**: 2026-01-03
**Current Version**: v1.7.0 (Published on Chrome Web Store)

---

## 🚧 In Progress (v1.8.0)

### Goals Section View Modes
- [x] Three view modes for Today's Focus: Full, Compact, and Focus
- [x] Full mode: Complete view with input, progress bar, task list, and incomplete section
- [x] Compact mode: Minimal task list with edit controls only
- [x] Focus mode: Single task display without container wrapper (glass-theme friendly)
- [x] Settings popover in Focus mode for switching modes and selecting focused goal
- [x] View mode persists across sessions via Chrome storage

### UI Improvements
- [x] Compact quote controls with circular progress ring for countdown
- [x] Improved popover/dropdown visibility with frosted glass background (95% opacity + blur)
- [x] Fixed reminders panel to open above button without overlapping

### Smart Ticker Animation
- [x] Slot-machine style animation for author name and category badge using `@tombcato/smart-ticker`
- [x] `AuthorTicker` component with character-level scrolling transitions
- [x] `CategoryTicker` component for animated category badge
- [x] Settings toggle: "Animate quote transitions" (disabled by default)
- [x] Animation uses Levenshtein diff algorithm for smooth character transitions

**Status**: Merged to main, pending release

---

## ✅ Recently Completed (v1.7.0)

### Glass Theme with Dynamic Backgrounds
- [x] New glass theme with frosted glass effect and dynamic Unsplash background images
- [x] Improved glass theme loading with animated shimmer indicator

### YouTube Music Player for Pomodoro
- [x] Embedded YouTube music player for focus sessions
- [x] Play ambient music, lo-fi beats, or custom playlists during Pomodoro sessions

### Customizable Notification Sounds
- [x] Customizable notification sounds for Pomodoro timer events
- [x] Multiple sound options for work/break transitions

### Compact Floating Reminder Widget
- [x] Compact floating widget in bottom-right corner (replaces side panel)
- [x] Show up to 3 priority reminders (overdue first, then upcoming)
- [x] "View all" modal for full reminder list
- [x] Live countdown for reminders within 5 minutes of due time
- [x] Snooze buttons for approaching reminders

### Goals with Link-to-Task Feature
- [x] Add goals feature with ability to link tasks to goals
- [x] Rename objectives terminology to goals throughout the app

### Storage Quota Error Handling
- [x] Surface Chrome storage quota errors in frontend with user-friendly messages

**Version Released**: December 2025

---

## ✅ Previously Completed (v1.6.0)

### Author Autocomplete
- [x] Reusable Autocomplete component with keyboard navigation and accessibility
- [x] Author autocomplete in Add Quote and Edit Quote forms
- [x] Streamlined quote management (removed floating "Add Custom Quote" button)

**Version Released**: December 2025

---

## ✅ Previously Completed (v1.5.0)

### Smart Reminder Templates
- [x] Pre-built reminder templates for common tasks
- [x] Health & Wellness: Drink Water, Stretch Break, Eye Rest, Medication, Exercise
- [x] Productivity: Daily Standup, End of Day Review, Weekly Review
- [x] Personal: Daily Journal, Gratitude

### Dedicated Goals Page
- [x] Full-page goals view with history and statistics
- [x] Filter by date range
- [x] Visual progress tracking

### Quick Reminder Presets
- [x] Natural language date picker ("tomorrow", "next week")
- [x] Quick time presets for common scheduling patterns

### Favorites Filter
- [x] Filter quotes by favorites in the category filter dropdown

**Version Released**: November 2025

---

## ✅ Previously Completed (v1.4.0)

### Accessibility Improvements
- [x] Semantic HTML landmarks (`<main>`, `<nav>`, `<header>`)
- [x] Skip-to-main-content link for keyboard users
- [x] `aria-live` regions for toast notifications and quote changes
- [x] `prefers-reduced-motion` support
- [x] ARIA attributes for dropdown menus

### Bulk Quote Operations
- [x] Multi-select checkboxes on quote cards
- [x] Select all / deselect all for filtered view
- [x] Bulk delete, favorite/unfavorite, hide/unhide actions

### Quote Restoration
- [x] "Restore Missing Quotes" - adds back deleted default quotes
- [x] "Reset All Quotes" - completely resets to factory defaults

### Full-Screen Focus Mode
- [x] Full-screen overlay with Unsplash background images
- [x] Large timer display with play/pause controls
- [x] Optional motivational quote display
- [x] Auto-enter focus mode when Pomodoro starts (configurable)

**Version Released**: November 2025

---

## ✅ Previously Completed (v1.3.0)

### Import & Onboarding
- [x] Data import functionality with version compatibility checking
- [x] File upload with JSON validation
- [x] Merge or replace options for imported data
- [x] Welcome modal for first-time users
- [x] Feature highlights in onboarding

### Quote Management Enhancements
- [x] Category filter for quotes with custom quote toggle
- [x] Version info displayed in main page footer

### Code Quality
- [x] Logger consistency (all console.* calls replaced with logger)
- [x] Additional component tests (CategoryFilter)

### Goals Page
- [x] Dedicated goals page with filtering (All/Incomplete/Completed)
- [x] Stats dashboard (today/week/month/all-time completion rates)
- [x] Goal history view with date grouping
- [x] Goal transfer to next day functionality

### Focus Mode (Full-Screen Pomodoro)
- [x] Full-screen focus mode overlay with scenic backgrounds
- [x] Unsplash integration with 10 fallback images per category
- [x] Large timer display with controls
- [x] Optional quote display during focus sessions
- [x] Auto-enter focus mode when timer starts (configurable)
- [x] Escape key to exit focus mode
- [ ] Website blocking (optional future enhancement)

**Version Released**: December 2025

---

## ✅ Previously Completed (v1.2.0)

### Chrome Web Store Publication
- [x] 3 versions published and live on Chrome Web Store
- [x] Release process with changesets and CI/CD
- [x] Automated Chrome Web Store publishing script
- [x] Store listing with screenshots and description

### Quote Management Page
- [x] Full-text search across text, author, source, and notes
- [x] 5 filter types (all, custom, default, favorites, hidden)
- [x] Full inline editing with modal and validation
- [x] Statistics display (total, custom, favorites, hidden counts)
- [x] Single quote delete with confirmation

### Export Functionality
- [x] Complete data export to JSON (all quotes, goals, reminders, settings)
- [x] Analytics JSON export (insights + analytics)
- [x] CSV exports:
  - Daily trends (last 30 days)
  - Weekly trends (last 12 weeks)
  - Monthly trends (last 6 months)
  - Goals data
  - Pomodoro sessions

### Advanced Analytics (Recharts)
- [x] TrendChart - Bar charts for daily/weekly/monthly trends
- [x] GoalCompletionChart - Radial gauges for completion rates
- [x] PomodoroHeatmap - Hourly and weekday distribution
- [x] Productive hours detection
- [x] Multi-tab analytics dashboard (Overview, Advanced, Exports)

### Pomodoro Enhancements
- [x] Long break system (configurable interval and duration)
- [x] 6 ambient sounds via Web Audio API (rain, ocean, forest, cafe, white noise, brown noise)
- [x] Sound notifications (start and completion melodies)
- [x] Goal integration (link sessions to goals)
- [x] Cross-tab synchronization via Web Locks API
- [x] Timer recovery after browser restart
- [x] Volume controls

### Code Quality
- [x] Logger abstraction with environment-aware log levels
- [x] Test infrastructure with Vitest and Testing Library
- [x] Test fixtures pattern for reusable test data
- [x] Version display in settings modal

**Version Released**: November 2025

---

## ✅ Previously Completed (v1.1)

### Dark Mode & Theme Customization
- [x] Full dark mode support with smooth transitions
- [x] 6 beautiful color themes using OKLCH color space:
  - Ocean Blue (default)
  - Forest Green
  - Sunset Orange
  - Royal Purple
  - Rose Pink
  - Slate Gray
- [x] Live theme preview sidebar with real-time visual feedback
- [x] Theme settings persist across sessions
- [x] All components fully themed (quotes, goals, pomodoro, insights)

### UI/UX Enhancements
- [x] Unified density customization (compact/comfortable/spacious)
  - Affects all spacing, padding, and layout density
  - Visual density preview in settings
  - Smooth transitions when changing density
- [x] Countdown progress bar on "New Quote" button
  - Shows remaining time until next auto-refresh
  - Smooth animation (100ms updates)
  - Only appears when auto-refresh is enabled
  - Resets on manual refresh and navigation
- [x] Fixed 12-hour time format (removed leading zero: "5:20 PM" not "05:20 PM")

### Technical Improvements
- [x] Fixed Vite 6.0.9+ CORS policy for dev mode
  - Added `skipWebSocketTokenCheck: true` in legacy config
  - Resolved development server connection issues
- [x] Migrated manifest to TypeScript configuration
  - Type-safe manifest configuration
  - Dynamic host_permissions based on environment
  - Better maintainability
- [x] Improved service worker reliability in development

### Code Quality
- [x] Consistent OKLCH color usage throughout theme system
- [x] Improved TypeScript typing for theme configuration
- [x] Better error handling in quote display
- [x] Optimized re-renders with proper React hooks usage

**Version Released**: January 16, 2025

---

## 🎯 Next Steps & Priorities

### ✅ Phase 1: Production Polish - COMPLETED 🚀

**Status: DONE - Published on Chrome Web Store**

#### 1.1 Production Optimizations
- [x] Console.log management via logger abstraction
  - Environment-aware log levels (DEBUG in dev, WARN+ in prod)
  - No build plugin needed - runtime configuration
- [ ] Bundle size optimization (optional)
  - Add bundle analyzer (`rollup-plugin-visualizer`)
  - Lazy load Insights page components
- [x] Performance - acceptable for extension size

#### 1.2 Chrome Web Store - PUBLISHED
- [x] Store listing assets (screenshots, icons)
- [x] Store description and feature list
- [x] Privacy policy
- [x] 3 versions published and live
- [x] Automated publishing via CI/CD

---

### Phase 2: Feature Enhancement ✨

**Priority: HIGH - Current focus**

#### 2.1 Quote Management Page - ✅ COMPLETE
- [x] Browse all quotes interface with list view
- [x] Filter quotes (5 types: all, custom, default, favorites, hidden)
- [x] Search functionality (full-text, debounced)
- [x] Edit custom quotes (modal with validation)
- [x] **Bulk operations**
  - Multi-select checkboxes
  - Select all / deselect all functionality
  - Bulk delete/favorite/hide
  - Confirmation dialogs for destructive actions
- [x] **Quote restoration**
  - Restore missing default quotes
  - Reset all quotes to defaults

#### 2.2 Export/Import Data - ✅ COMPLETE
- [x] Export all data to JSON
- [x] Export CSV (multiple types)
- [x] Import from backup
  - File upload UI
  - JSON validation with version compatibility
  - Merge or replace options

#### 2.3 Onboarding & Tutorials - ✅ MOSTLY COMPLETE
- [x] First-time user experience
  - Welcome modal with feature highlights
  - Skip/don't show again option
- [ ] Interactive tutorials (optional)
- [ ] Help documentation (optional)

**User value**: HIGH - Reduces friction for new users

#### 2.4 Accessibility - ✅ COMPLETE
- [x] 40+ ARIA labels on interactive elements
- [x] Keyboard navigation (Escape, Enter, Tab)
- [x] Focus indicators
- [x] Screen reader-friendly form labels
- [x] Semantic HTML landmarks (`<main>`, `<nav>`, `<header>`)
- [x] Skip navigation links
- [x] `aria-live` regions for dynamic content (toasts, quote changes)
- [x] `prefers-reduced-motion` support
- [x] ARIA attributes for dropdown menus (`aria-expanded`, `aria-haspopup`, `role="menu"`)
- [x] `aria-current="page"` for active navigation

**User value**: HIGH - Inclusivity matters

---

### Phase 3: Advanced Features 📊

**Priority: MEDIUM - Differentiation**

#### 3.1 Advanced Analytics - ✅ COMPLETE
- [x] Visual charts with Recharts
  - TrendChart (bar charts for daily/weekly/monthly)
  - GoalCompletionChart (radial gauges)
  - PomodoroHeatmap (hourly + weekday distribution)
- [x] Export reports (JSON + CSV)
- [x] Productive hours detection
- [ ] Custom date ranges (optional enhancement)
- [ ] Goal categories/tagging (optional)

#### 3.2 Quote Collections - ❌ NOT STARTED
- [ ] Create custom collections
- [ ] Collection management
- [ ] Collection rotation
- [ ] Share/import collections

**User value**: MEDIUM - Great for themed quotes

#### 3.3 Smart Reminders - ⚠️ PARTIAL
- [x] Natural language input (chrono-node)
- [x] Quick presets (1hr, 3hr, tomorrow 9am, next Monday, etc.)
- [x] Basic recurring (daily/weekly/monthly)
- [x] Snooze functionality
- [ ] Context-aware suggestions
- [ ] Habit-based automatic reminders
- [ ] Reminder templates
- [ ] Task dependencies

**User value**: MEDIUM - Convenience feature

#### 3.4 Pomodoro Enhancements - ✅ COMPLETE
- [x] Long break system (configurable interval + duration)
- [x] Task/goal integration (link Pomodoro to goals)
- [x] Sounds & Music (6 ambient sounds via Web Audio API)
- [x] Volume controls
- [x] Completion sounds
- [x] Advanced stats (heatmaps, productive hours)
- [x] **Focus mode** - IMPLEMENTED
  - Full-screen timer with Unsplash backgrounds
  - Auto-enter when timer starts (configurable)
  - Optional quote display
- [ ] Website blocking (optional enhancement)

#### 3.5 Customization Options - ⚠️ PARTIAL
- [x] 6 color themes (OKLCH-based)
- [x] 3 density modes (compact/comfortable/spacious)
- [x] Dark/light mode with auto option
- [x] Focus Mode backgrounds (6 Unsplash categories: nature, forest, ocean, mountains, minimal, dark)
- [x] Image preloading for smooth transitions
- [ ] Main view backgrounds (gradients, patterns)
- [ ] Font options (optional)

---

### Phase 4: Platform Expansion (3-6 months) 🌍

**Priority: HIGH - Strategic growth**

#### 4.1 Web App (Next.js)
- [ ] Set up Next.js 14+ in `apps/web`
  - App Router
  - TypeScript
  - Tailwind CSS
- [ ] Configure LocalStorage adapter
  - Already exists in `packages/storage`
  - Wire up to Next.js app
- [ ] Reuse shared packages
  - `@cuewise/shared` - All business logic ✅
  - `@cuewise/storage` - LocalStorage adapter ✅
  - `@cuewise/ui` - All components ✅
- [ ] Add web-specific features
  - Next.js routing
  - SEO optimization
  - Landing page
  - Authentication (optional)
- [ ] Progressive Web App (PWA)
  - Service worker
  - Offline support
  - Install prompt
- [ ] Deploy to Vercel
  - CI/CD pipeline
  - Preview deployments
  - Production deployment

**Estimated effort**: 2-3 weeks
**User value**: VERY HIGH - Reaches non-extension users
**Code reuse**: ~90% (monorepo advantage!)

#### 4.2 Cloud Sync Backend
- [ ] Choose backend stack
  - **Option A**: tRPC + Prisma + PostgreSQL
  - **Option B**: Supabase (fastest)
  - **Option C**: Firebase
- [ ] Design database schema
  - Users
  - Quotes
  - Goals
  - Reminders
  - Pomodoro sessions
  - Settings
- [ ] Create CloudStorageAdapter
  - Implement StorageAdapter interface
  - Offline fallback
  - Conflict resolution
- [ ] Authentication
  - Email/password
  - OAuth (Google, GitHub)
  - Session management
- [ ] Sync logic
  - Real-time sync
  - Batch sync
  - Last-write-wins or CRDT
- [ ] API endpoints
  - CRUD operations
  - Bulk operations
  - Data export

**Estimated effort**: 4-6 weeks
**User value**: VERY HIGH - Cross-device sync

#### 4.3 Mobile App (React Native)
- [ ] Set up React Native with Expo
  - Create `apps/mobile`
  - Configure Expo
  - TypeScript setup
- [ ] Configure AsyncStorage adapter
  - Already exists in `packages/storage`
  - Test on iOS/Android
- [ ] Reuse shared packages
  - `@cuewise/shared` - All business logic ✅
  - `@cuewise/storage` - AsyncStorage adapter ✅
- [ ] Create native UI components
  - **Option A**: Create `packages/ui-native`
  - **Option B**: Use Tamagui/NativeWind
  - **Option C**: Use Gluestack UI
- [ ] Native features
  - Push notifications (expo-notifications)
  - Widgets (iOS/Android)
  - Quick capture shortcuts
  - Haptic feedback
- [ ] Navigation
  - React Navigation
  - Tab bar
  - Stack navigation
- [ ] Deploy to stores
  - Apple App Store
  - Google Play Store
  - TestFlight/Internal testing

**Estimated effort**: 6-8 weeks
**User value**: VERY HIGH - Mobile-first users
**Code reuse**: ~70-80%

**Total Phase 4**: 12-17 weeks

---

## 🐛 Technical Debt & Maintenance

### Current Status

#### Code Quality - ✅ GOOD
- [x] Console.log management via logger abstraction
  - Environment-aware log levels
  - No build plugin needed
- [x] TypeScript strict mode throughout
- [ ] JSDoc comments (optional - code is readable)

#### Performance - ⚠️ ACCEPTABLE
- [ ] Bundle size audit (optional)
  - Add rollup-plugin-visualizer for visibility
- [ ] Lazy load heavy components (optional)
  - InsightsPage with charts
  - Could reduce initial load
- [x] Re-render optimization with proper hooks

#### Testing - ✅ SOLID FOUNDATION
- [x] Test infrastructure (Vitest + Testing Library)
- [x] Store tests (quote-store, goal-store, pomodoro-store)
- [x] Component tests (QuoteDisplay, EditableValue)
- [x] Test fixtures pattern for reusable data
- [x] CI/CD with GitHub Actions
- [ ] Increase coverage to 70%+ (ongoing)
- [ ] E2E tests with Playwright (optional)

#### Documentation - ✅ COMPLETE
- [x] CLAUDE.md - AI development guide
- [x] ARCHITECTURE.md - System design
- [x] README.md - User documentation
- [x] LINTING.md - Code style guide
- [x] ROADMAP.md - This file
- [ ] API documentation (optional - TypeDoc)

---

## 📦 Potential New Features (Backlog)

### User-Requested Features (collect from feedback)
- [ ] Multi-language support (i18n)
- [ ] Calendar integration (Google Calendar sync)
- [ ] Quote of the week email
- [ ] Social sharing (share quotes)
- [ ] Collaborative goals (team mode)
- [ ] Gamification (achievements, badges)
- [ ] AI-powered quote recommendations
- [ ] Voice input for goals/reminders
- [ ] Browser extension for Firefox/Safari
- [ ] Desktop app (Electron)

### Integration Ideas
- [ ] Notion integration
- [ ] Todoist sync
- [ ] Google Tasks sync
- [ ] Slack notifications
- [ ] Discord bot
- [ ] API for third-party integrations

---

## 🎯 Recommended Next Priorities

### ✅ Recently Completed: Focus Mode (Phase 3.4)
- Full-screen focus mode with Unsplash backgrounds
- Auto-enter when Pomodoro timer starts
- Optional quote display during focus sessions
- Escape key to exit focus mode

### Phase 3 Features (Next Focus)

1. **Quote Collections** (Priority: MEDIUM) - Not Started
   - Create custom themed collections
   - Add/remove quotes from collections
   - Collection rotation for display

2. **Smart Reminders Enhancement** (Priority: MEDIUM) - Partial
   - ✅ Natural language input already implemented
   - Context-aware suggestions
   - Habit-based automatic reminders
   - Reminder templates

3. **Main View Backgrounds** (Priority: LOW) - Not Started
   - Gradients and patterns for main extension view
   - (Focus Mode backgrounds already complete)

### Future: Platform Expansion

When ready for growth:
1. **Web App** (Next.js) - ~90% code reuse
2. **Cloud Sync Backend** - Cross-device sync
3. **Mobile App** (React Native) - ~70-80% code reuse

---

## 📈 Success Metrics

### Extension Adoption
- Chrome Web Store installs
- Daily active users (DAU)
- User retention rate
- Average session time

### Engagement
- Quotes viewed per day
- Goals created per user
- Pomodoro sessions completed
- Custom quotes created

### Quality
- Bug reports
- User ratings
- Feature requests
- Support tickets

---

## 🔄 Review Schedule

- **Weekly**: Review completed tasks, plan next week
- **Monthly**: Assess roadmap priorities, gather user feedback
- **Quarterly**: Strategic review, adjust long-term goals

---

## 📝 Notes

### Architecture Strengths
- ✅ Monorepo structure enables 90% code reuse for web/mobile
- ✅ Storage adapter pattern ready for multi-platform
- ✅ Shared business logic is platform-agnostic
- ✅ TypeScript throughout ensures type safety
- ✅ Modern tech stack (React 18, Vite, Zustand)
- ✅ Test infrastructure with fixtures pattern
- ✅ CI/CD with automated releases

### Current Limitations
- Single-platform (browser extension only)
- No cloud sync (local storage + Chrome Sync only)
- No user accounts

### Future Opportunities
- Premium features (cloud sync, advanced analytics)
- Team/collaborative features
- AI-powered productivity insights
- Integration marketplace
- White-label productivity suite

---

**Version History**
- v1.8.0 (pending) - Goals view modes (Full/Compact/Focus), compact quote controls, smart ticker animation, UI improvements
- v1.7.0 (2025-12) - Glass theme, YouTube music player, notification sounds, floating reminder widget
- v1.6.0 (2025-12) - Author autocomplete, streamlined quote management
- v1.5.0 (2025-11) - Smart reminder templates, dedicated goals page, favorites filter
- v1.4.0 (2025-11) - Accessibility improvements, bulk quote operations, full-screen focus mode
- v1.3.0 (2025-12) - Data import, onboarding welcome modal, category filter
- v1.2.0 (2025-11) - Chrome Web Store published, Quote Management, Analytics, Pomodoro enhancements
- v1.1.0 (2025-01) - Dark mode, themes, density modes
- v1.0.0 (2025-01) - Initial release
