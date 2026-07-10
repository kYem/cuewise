# CLAUDE.md - AI Development Guide

This document provides AI assistants (like Claude) with essential context about the Cuewise codebase structure, patterns, and conventions.

## Project Overview

**Cuewise** is a cross-platform productivity suite with motivational quotes, goals, reminders, and productivity tracking. Built as a **monorepo** to support:

1. **Browser Extension** (Chrome/Edge) - Currently implemented
2. **Web App** (Next.js) - Planned
3. **Mobile App** (React Native) - Planned

**Current Version**: v1.0 (Browser Extension)

## Tech Stack

### Monorepo Tools
- **Package Manager**: pnpm with workspaces
- **Build System**: Turbo (turborepo)
- **Language**: TypeScript throughout
- **Linting/Formatting**: Biome (50x faster than ESLint)

### Browser Extension Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with @crxjs/vite-plugin
- **UI**: Tailwind CSS + custom components
- **State Management**: Zustand
- **Storage**: Chrome Storage API via adapters
- **Icons**: Lucide React
- **Target**: Chrome/Edge (Manifest V3)

## Architecture Principles

### 1. Multi-Platform Code Sharing

The monorepo is designed for maximum code reuse across platforms:

```
packages/
  shared/    - Platform-agnostic business logic (types, utils, constants)
  storage/   - Multi-platform storage with adapters
  ui/        - Shared UI components (web-focused, can extend to native)

apps/
  browser-extension/  - Current implementation
  web/               - Future Next.js app
  mobile/            - Future React Native app
```

### 2. Ports & Adapters

**Critical Pattern**: Platform-specific capabilities — scheduling wake-ups, delivering OS notifications, and persisting data — are accessed through platform-agnostic **ports** (interfaces) in `@cuewise/shared/platform`. Each app provides **adapters** and registers them once at startup through a single DI container.

```typescript
// Ports (interfaces) — packages/shared/src/platform/
// Command interfaces (page/stores depend on these); subscription lives on the
// Host variants so a command-only context can't accidentally subscribe.
interface Scheduler { scheduleAt(id, when): Promise<void>; cancel(id): Promise<void>; }
interface SchedulerHost extends Scheduler { onFire(handler): () => void; }
interface Notifier { notify(opts): Promise<void>; clear(id): Promise<void>; }
interface NotifierHost extends Notifier { onClick(handler): () => void; onAction(handler): () => void; }
interface KeyValueStore { get(key, area); set(key, value, area); remove(key, area); getUsage(area); }

// One container, configured at startup — merges, so storage self-registers on import
// and the app adds scheduler/notifier (page, service worker, future Tauri/RN app):
configurePlatform({ scheduler, notifier, storage });
// Portable code resolves via getScheduler() / getNotifier() / getStorage()
```

Adapters:
- Browser extension: `ChromeScheduler` / `ChromeNotifier` (`apps/browser-extension/src/platform/`), `ChromeKeyValueStore` (`@cuewise/storage`, self-registers as the default backend).
- Future Tauri (macOS) / React Native: supply `Tauri*` / `Native*` adapters and call `configurePlatform` — no store or helper code changes.

**Storage usage**: go through the typed helpers, not the port directly.
```typescript
import { getReminders, setReminders } from '@cuewise/storage';
await setReminders(remindersArray);
const reminders = await getReminders();
```

**Location**: ports + registry in `packages/shared/src/platform/`; storage adapter + typed helpers in `packages/storage/src/`.

### 3. Pure Business Logic in Shared Package

`packages/shared/` contains types, constants, utilities, CSV parsing, and the logger. Also includes analytics types (InsightsData, AdvancedAnalytics), YouTube/sound types, and import/export types.

**Key Rule**: This package must be platform-agnostic (no browser/DOM/React dependencies).

## Directory Structure

```
cuewise/
├── apps/
│   └── browser-extension/
│       ├── src/
│       │   ├── components/           # ~60 React components
│       │   │   ├── FocusMode/        # Focus mode (timer, quote, controls, background)
│       │   │   ├── goals/            # Goal cards, forms, pickers
│       │   │   ├── settings/         # Settings panels (pomodoro, notifications, focus, etc.)
│       │   │   ├── sounds/           # Soundscapes, YouTube, mini player
│       │   │   ├── __fixtures__/     # Test fixtures for component tests
│       │   │   ├── NewTabPage.tsx     # Home page
│       │   │   ├── PomodoroPage.tsx   # Pomodoro timer page
│       │   │   ├── InsightsPage.tsx   # Analytics page
│       │   │   ├── QuoteManagementPage.tsx  # Quote management
│       │   │   ├── GoalsPage.tsx      # Goals overview
│       │   │   └── ...               # QuoteDisplay, Clock, Modals, etc.
│       │   ├── stores/               # Zustand stores
│       │   │   ├── quote-store.ts
│       │   │   ├── goal-store.ts
│       │   │   ├── pomodoro-store.ts
│       │   │   ├── reminder-store.ts
│       │   │   ├── settings-store.ts
│       │   │   ├── focus-mode-store.ts
│       │   │   ├── sounds-store.ts
│       │   │   ├── insights-store.ts
│       │   │   ├── toast-store.ts
│       │   │   └── __fixtures__/     # Test fixtures for store tests
│       │   ├── data/
│       │   │   └── seed-quotes.ts
│       │   ├── App.tsx               # Hash-based routing (#pomodoro, #insights, etc.)
│       │   └── main.tsx
│       ├── manifest.json             # Extension manifest (Manifest V3)
│       └── dist/                     # Build output (load in Chrome)
│
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts              # 50+ interfaces/types
│   │       ├── constants.ts          # Categories, themes, sounds, templates
│   │       ├── utils.ts              # Pure utility functions
│   │       ├── csv-utils.ts          # CSV parsing for bulk import
│   │       ├── logger.ts             # Configurable logger
│   │       ├── platform/             # Platform ports + DI registry (Scheduler, Notifier, KeyValueStore)
│   │       └── index.ts
│   │
│   ├── storage/
│   │   └── src/
│   │       ├── chrome-key-value-store.ts  # ChromeKeyValueStore adapter (KeyValueStore port)
│   │       ├── chrome-storage.ts     # Low-level delegators over the platform port
│   │       ├── storage-helpers.ts    # Typed helper functions
│   │       └── index.ts
│   │
│   ├── test-utils/
│   │   └── src/
│   │       ├── factories/            # quote, goal, pomodoro, reminder factories
│   │       ├── mocks/                # zustand, chrome-storage mocks
│   │       ├── fixtures/             # settings fixtures
│   │       └── index.ts
│   │
│   └── ui/
│       └── src/
│           ├── components/           # Button, Badge, Card, Input, Toast, Chart, etc.
│           └── lib/                  # cn() helper
│
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
└── CLAUDE.md
```

## Pages & Routing

Hash-based routing in `App.tsx`:
- `#` → `NewTabPage` (home - quote display, clock, goals)
- `#pomodoro` → `PomodoroPage` (timer, heatmap, active widget)
- `#insights` → `InsightsPage` (analytics, trends, charts)
- `#quotes` → `QuoteManagementPage` (browse, filter, bulk actions, import/export)
- `#goals` → `GoalsPage` (goals overview, completion charts)

## Key Data Types

All types are in `packages/shared/src/types.ts`. Key interfaces:

- **Quote**: id, text, author, category (10 types), isCustom, isFavorite, isHidden, viewCount, lastViewed, source, notes, `collectionIds`
- **QuoteCollection**: id, name, description, createdAt, updatedAt
- **Goal**: id, text, completed, createdAt, date, `type` ('task' | 'objective'), `parentId`, `transferCount`, `description`
- **Reminder**: id, text, dueDate, completed, notified, recurring, category ('health' | 'productivity' | 'personal'), completedAt
- **PomodoroSession**: id, startedAt, completedAt, interrupted, duration, type ('work' | 'break' | 'longBreak'), goalId
- **Settings**: 50+ properties covering pomodoro, notifications, UI themes, focus mode, goals, quotes
- **InsightsData**: Analytics data — streak, completion rates, focus time, category view counts
- **AdvancedAnalytics**: dailyTrends, weeklyTrends, monthlyTrends, goalCompletionRate, pomodoroHeatmap

### Key Type Aliases
- `QuoteCategory`: 'inspiration' | 'learning' | 'productivity' | 'mindfulness' | 'success' | 'creativity' | 'resilience' | 'leadership' | 'health' | 'growth'
- `ColorTheme`: 'purple' | 'forest' | 'rose' | 'glass'
- `LayoutDensity`: 'compact' | 'comfortable' | 'spacious'
- `QuoteDisplayMode`: 'normal' | 'compact' | 'bottom' | 'hidden'
- `FocusImageCategory`: 'nature' | 'forest' | 'ocean' | 'mountains' | 'minimal' | 'dark'

### Storage Keys
All storage keys are defined in `packages/shared/src/types.ts`:
```typescript
STORAGE_KEYS = {
  QUOTES: 'quotes',              // Legacy
  SEED_QUOTES: 'seedQuotes',     // Always in local storage
  CUSTOM_QUOTES: 'customQuotes', // In sync storage when enabled
  GOALS: 'goals',
  REMINDERS: 'reminders',
  POMODORO_SESSIONS: 'pomodoroSessions',
  POMODORO_STATE: 'pomodoroState',
  SETTINGS: 'settings',
  CURRENT_QUOTE: 'currentQuote',
  CUSTOM_YOUTUBE_PLAYLISTS: 'customYoutubePlaylists',
  YOUTUBE_PROGRESS: 'youtubeProgress',
  DAILY_BACKGROUND: 'dailyBackground',
  COLLECTIONS: 'collections',
}
```

## State Management Pattern

Uses **Zustand** for state management. Stores are in `apps/browser-extension/src/stores/`.

### Stores

| Store | Purpose |
|-------|---------|
| `quote-store` | Quote CRUD, history navigation, favorites, hiding |
| `goal-store` | Goals CRUD, completion tracking, transfer between days |
| `pomodoro-store` | Timer state, sessions, work/break cycles |
| `reminder-store` | Reminders CRUD, recurring reminders, notifications |
| `settings-store` | All user settings (50+ properties) |
| `focus-mode-store` | Focus mode state, background images |
| `sounds-store` | Ambient sounds, YouTube playback, playlists |
| `insights-store` | Analytics data, trends, heatmaps |
| `toast-store` | Toast notifications with auto-logging |

**Key Pattern**: Each store handles both local state AND persistence via `@cuewise/storage` helpers, and uses business logic from `@cuewise/shared`.

## Error Handling & Logging Pattern

### Use the Logger, Not console.error

**IMPORTANT**: Never use `console.error/log/warn/debug` directly. Use `logger` from `@cuewise/shared`:

```typescript
import { logger } from '@cuewise/shared';

logger.error('Error updating settings', error);
logger.warn('Deprecated API usage');
logger.info('User logged in');
logger.debug('Debug info', { userId: 123 });
```

The logger is configurable via settings (log level: none, error, warn, info, debug). **Location**: `packages/shared/src/logger.ts`

### Error Handling Pattern in Stores

Use `logger.error()` for the raw error object, then `useToastStore` for user-facing feedback:

```typescript
try {
  await someAsyncOperation();
} catch (error) {
  logger.error('Error context for debugging', error);
  const errorMessage = 'User-friendly error message';
  set({ error: errorMessage });
  useToastStore.getState().error(errorMessage);
}
```

Toast store supports three levels: `error()`, `warning()`, `success()`. **Location**: `apps/browser-extension/src/stores/toast-store.ts`

## Component Patterns

### Imports Organization
```typescript
// 1. Shared packages (business logic)
import { CATEGORY_COLORS, type Quote } from '@cuewise/shared';

// 2. Storage
import { getQuotes } from '@cuewise/storage';

// 3. UI components
import { cn } from '@cuewise/ui';

// 4. External libraries
import { Heart, RefreshCw } from 'lucide-react';
import type React from 'react';

// 5. Local imports
import { useQuoteStore } from '../stores/quote-store';
```

### Styling Pattern
- **Tailwind CSS** utility classes
- Category colors from `CATEGORY_COLORS` constant
- `cn()` helper for conditional classes (from `@cuewise/ui`)
- 4 color themes: purple, forest, rose, glass (glass uses Unsplash background images)

## Common Development Tasks

### Adding a New Feature

1. **Add types** to `packages/shared/src/types.ts`
2. **Add business logic** to `packages/shared/src/utils.ts`
3. **Add storage helpers** to `packages/storage/src/storage-helpers.ts`
4. **Create Zustand store** in `apps/browser-extension/src/stores/`
5. **Create components** in `apps/browser-extension/src/components/`
6. **Wire up in App.tsx**

### Running the Extension

```bash
# Development mode (HMR enabled)
pnpm --filter @cuewise/browser-extension dev

# Production build
pnpm --filter @cuewise/browser-extension build

# Or build all packages
pnpm build
```

**Load in Chrome**:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `apps/browser-extension/dist`

## Code Quality

### Linting & Formatting

Uses **Biome** (not ESLint/Prettier):
- 50-100x faster than ESLint
- All-in-one: linting + formatting
- Configuration: `biome.json` at root

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Format code
pnpm format
```

**Key Rules**:
- 2-space indentation
- Single quotes (JS/TS), double quotes (JSX)
- 100-character line width
- Semicolons always
- Auto-organize imports

See [LINTING.md](./LINTING.md) for details.

### Type Checking

```bash
# Check types for all packages
pnpm type-check

# Check specific package
pnpm --filter @cuewise/browser-extension type-check
```

## Important Patterns & Conventions

### 1. Workspace Dependencies

Always use `workspace:*` for internal packages:

```json
{
  "dependencies": {
    "@cuewise/shared": "workspace:*",
    "@cuewise/storage": "workspace:*",
    "@cuewise/ui": "workspace:*"
  }
}
```

### 2. ID Generation

Use the shared utility:
```typescript
import { generateId } from '@cuewise/shared';

const newGoal: Goal = {
  id: generateId(), // Format: timestamp-random
  // ...
};
```

### 3. Date Handling

Use shared date utilities:
```typescript
import { getTodayDateString, formatDate, isToday } from '@cuewise/shared';

const today = getTodayDateString(); // "2025-01-15"
const readable = formatDate(today); // "January 15, 2025"
if (isToday(goal.date)) { /* ... */ }
```

### 4. Random Quote Selection

Always filter out hidden quotes:
```typescript
import { getRandomQuote } from '@cuewise/shared';

// CORRECT: Uses shared utility (filters hidden quotes)
const quote = getRandomQuote(quotes);

// WRONG: Manual selection (doesn't filter hidden)
const quote = quotes[Math.floor(Math.random() * quotes.length)];
```

### 5. Category Colors

Use constant for consistency:
```typescript
import { CATEGORY_COLORS } from '@cuewise/shared';

const color = CATEGORY_COLORS[quote.category]; // "#8B5CF6"
```

### 6. Code Style

**Always use explicit if blocks** - never use shorthand conditionals:
```typescript
// CORRECT: Full if block
if (condition) {
  doSomething();
}

// WRONG: Shorthand
condition && doSomething();

// WRONG: Single-line without braces
if (condition) doSomething();
```

## Testing Strategy

### Testing Tools
- **Test Runner**: Vitest (fast, Vite-native)
- **Component Testing**: React Testing Library
- **Mocking**: Vitest built-in mocks
- **Factories**: `@cuewise/test-utils/factories` for test data

### Test Organization
- **`packages/shared`**: Unit tests (pure functions, platform-agnostic)
- **Storage adapters**: Integration tests per platform
- **Components**: Component tests with React Testing Library
- **Stores**: State management tests with Zustand

### Test Fixtures Pattern

Store reusable test data, mock builders, and assertion helpers in `__fixtures__` directories alongside test files:

```
src/stores/__fixtures__/quote-store.fixtures.ts   # Data builders, state presets, assertions
src/components/__fixtures__/quote-display.fixtures.ts  # Mock stores, default props
```

**Fixture categories**: Test data builders, state presets, mock builders, assertion helpers, complex test scenarios. See existing `__fixtures__/` directories for examples.

### Testing Best Practices

**Key Principles:**
1. **Keep tests simple and small** - Each test should verify one specific behavior
2. **Always abstract to fixtures** - Extract test data, mocks, and setup into fixture files
3. **Use descriptive names** - Test names should read like documentation

**DO:**
- ✅ Use semantic fixture names that describe the scenario
- ✅ Create assertion helpers for complex validations
- ✅ Build test scenarios for edge cases (hidden quotes, deleted items)
- ✅ Keep tests focused on one behavior per test
- ✅ Use factories from `@cuewise/test-utils` for base data
- ✅ Extract default props and common mocks into fixture files
- ✅ Use `expect(...).toBeRejectedWith()` instead of try/catch in tests
- ✅ Use explicit `if` blocks instead of shorthand conditions

**DON'T:**
- ❌ Repeat mock setup code across multiple tests
- ❌ Create inline test data when fixtures would be clearer
- ❌ Write assertion logic multiple times
- ❌ Mix multiple concerns in a single test
- ❌ Use try/catch blocks in tests - use expect assertions for errors
- ❌ Use shorthand if statements - always use full `if () {}` blocks

**Running Tests**:
```bash
# Run all tests
pnpm --filter @cuewise/browser-extension test

# Watch mode
pnpm --filter @cuewise/browser-extension test:watch

# With coverage
pnpm --filter @cuewise/browser-extension test:coverage
```

## Common Gotchas

### 1. Chrome Storage is Asynchronous

Always `await` storage operations:
```typescript
// WRONG
const quotes = getQuotes(); // Returns Promise, not Quote[]

// CORRECT
const quotes = await getQuotes(); // Quote[]
```

### 2. Don't Import Browser APIs in Shared Package

```typescript
// WRONG: packages/shared/src/utils.ts
export function saveToStorage(data: Quote[]) {
  chrome.storage.local.set({ quotes: data }); // NO! Chrome API in shared code
}

// CORRECT: Use storage adapter in app/store code
import { setQuotes } from '@cuewise/storage';
await setQuotes(data);
```

### 3. Package References

Use `@cuewise/` prefix for internal packages:
```typescript
// CORRECT
import { Quote } from '@cuewise/shared';
import { getQuotes } from '@cuewise/storage';

// WRONG
import { Quote } from 'shared';
import { Quote } from '../../../packages/shared';
```

### 4. Turbo Cache

If builds seem stale:
```bash
# Clear Turbo cache
pnpm clean

# Reinstall dependencies
rm -rf node_modules packages/*/node_modules
pnpm install
```

## Future Platform Expansion

See [ARCHITECTURE.md](./ARCHITECTURE.md) for adding web (Next.js) and mobile (React Native) apps. The storage adapter pattern and `@cuewise/shared` are designed for multi-platform reuse.

## Key Files Reference

| File | Purpose | When to Edit |
|------|---------|--------------|
| `packages/shared/src/types.ts` | Core data types (50+ interfaces) | Adding new entities/interfaces |
| `packages/shared/src/constants.ts` | Categories, themes, sounds, templates | Adding categories, defaults |
| `packages/shared/src/utils.ts` | Business logic utilities | Adding platform-agnostic functions |
| `packages/shared/src/csv-utils.ts` | CSV parsing for bulk import | Modifying import/export |
| `packages/shared/src/logger.ts` | Configurable logger | Changing log behavior |
| `packages/storage/src/storage-helpers.ts` | Typed storage helpers | Adding new storage operations |
| `packages/test-utils/src/` | Factories, mocks, fixtures | Adding test infrastructure |
| `apps/browser-extension/src/stores/` | 9 Zustand stores | Adding features with state |
| `apps/browser-extension/src/components/` | ~60 React components | Adding new UI elements |
| `apps/browser-extension/src/App.tsx` | Hash routing, theme system | Adding new pages |
| `apps/browser-extension/manifest.json` | Extension config (Manifest V3) | Changing permissions/behavior |
| `turbo.json` | Build pipeline | Optimizing builds |
| `biome.json` | Linting/formatting | Changing code style rules |

## Quick Commands Reference

```bash
# Development
pnpm --filter @cuewise/browser-extension dev

# Build all
pnpm build

# Build specific package
pnpm --filter @cuewise/browser-extension build

# Lint
pnpm lint          # Check
pnpm lint:fix      # Auto-fix

# Format
pnpm format        # Format all files

# Type check
pnpm type-check

# Clean builds
pnpm clean
```

## Testing with Playwright (Browser Automation)

Dev server at `http://localhost:5173/` supports Playwright, Puppeteer, or Selenium for visual testing.

```bash
# Check if dev server is already running
lsof -i :5173

# Start if not running
pnpm --filter @cuewise/browser-extension dev
```

**Key pages to test**: Home (`/`), Pomodoro (`#pomodoro`), Insights (`#insights`), Quotes (`#quotes`), Goals (`#goals`). Test density modes, color themes (4), light/dark mode, and focus mode.

**Note**: Dev server uses Vite HMR. For production testing, load `apps/browser-extension/dist` as unpacked extension in Chrome.

## Package Naming Convention

- **Apps**: `@cuewise/browser-extension`, `@cuewise/web`, `@cuewise/mobile`
- **Shared**: `@cuewise/shared`, `@cuewise/storage`, `@cuewise/ui`, `@cuewise/test-utils`
- **Scope**: Always use `@cuewise/` prefix

## Version Control

- **Main branch**: Latest stable code
- **Feature branches**: `feature/description` or `claude/description`
- **Commit style**: Conventional commits preferred
  - `feat: add custom quote creation`
  - `fix: quote display on hidden quotes`
  - `docs: update CLAUDE.md`
  - `refactor: extract storage adapter pattern`

## Additional Resources

- [README.md](./README.md) - User-facing documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture guide
- [LINTING.md](./LINTING.md) - Biome setup and usage
- [Biome Docs](https://biomejs.dev/) - Linting/formatting reference
- [Zustand Docs](https://docs.pmnd.rs/zustand) - State management
- [Turbo Docs](https://turbo.build/repo) - Monorepo build system

---

**Last Updated**: 2026-03-31
