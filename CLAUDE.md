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

### 2. Storage Adapter Pattern

**Critical Pattern**: All storage access uses platform-agnostic adapters.

```typescript
// Shared interface for all platforms
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  clear(): Promise<boolean>;
}

// Platform-specific implementations:
- ChromeStorageAdapter   → chrome.storage API (browser extension)
- LocalStorageAdapter    → localStorage (web app)
- AsyncStorageAdapter    → AsyncStorage (React Native)
```

**Usage Pattern**:
```typescript
// Browser extension
import { ChromeStorageAdapter, StorageManager } from '@cuewise/storage';
const storage = new StorageManager(new ChromeStorageAdapter('local'));

// All platforms use the same API
await storage.set('quotes', quotesArray);
const quotes = await storage.get<Quote[]>('quotes');
```

**Location**: `packages/storage/src/`

### 3. Pure Business Logic in Shared Package

`packages/shared/` contains:
- **Types**: Quote, Goal, Reminder, PomodoroSession, Settings, InsightsData
- **Constants**: QUOTE_CATEGORIES, CATEGORY_COLORS, DEFAULT_SETTINGS
- **Utils**: Date formatting, random selection, streak calculation

**Key Rule**: This package must be platform-agnostic (no browser/DOM/React dependencies).

## Directory Structure

```
cuewise/
├── apps/
│   └── browser-extension/
│       ├── src/
│       │   ├── components/      # React components
│       │   │   ├── QuoteDisplay.tsx
│       │   │   ├── GoalsSection.tsx
│       │   │   ├── AddQuoteForm.tsx
│       │   │   └── Clock.tsx
│       │   ├── stores/          # Zustand stores
│       │   │   ├── quote-store.ts
│       │   │   └── goal-store.ts
│       │   ├── data/
│       │   │   └── seed-quotes.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── manifest.json        # Extension manifest (Manifest V3)
│       └── dist/                # Build output (load in Chrome)
│
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts         # Core TypeScript interfaces
│   │       ├── constants.ts     # Shared constants
│   │       ├── utils.ts         # Pure utility functions
│   │       └── index.ts
│   │
│   ├── storage/
│   │   └── src/
│   │       ├── storage-interface.ts      # StorageAdapter interface
│   │       ├── adapters/
│   │       │   ├── chrome-storage-adapter.ts
│   │       │   ├── local-storage-adapter.ts
│   │       │   └── async-storage-adapter.ts
│   │       ├── storage-helpers.ts        # Typed helper functions
│   │       └── index.ts
│   │
│   └── ui/
│       └── src/
│           ├── components/      # Shared React components
│           └── lib/            # UI utilities (cn helper)
│
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json                   # Biome configuration
├── README.md
├── ARCHITECTURE.md
├── LINTING.md
└── CLAUDE.md                    # This file
```

## Key Data Types

### Quote
```typescript
interface Quote {
  id: string;
  text: string;
  author: string;
  category: QuoteCategory;  // 10 categories
  isCustom: boolean;        // User-created quote
  isFavorite: boolean;
  isHidden: boolean;
  viewCount: number;
  lastViewed?: string;      // ISO date
  source?: string;          // Book, URL, reference
  notes?: string;           // Personal notes
}
```

### Goal
```typescript
interface Goal {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;        // ISO date
  date: string;             // YYYY-MM-DD
}
```

### Storage Keys
All storage keys are defined in `packages/shared/src/types.ts`:
```typescript
const STORAGE_KEYS = {
  QUOTES: 'quotes',
  GOALS: 'goals',
  REMINDERS: 'reminders',
  POMODORO_SESSIONS: 'pomodoroSessions',
  SETTINGS: 'settings',
  CURRENT_QUOTE: 'currentQuote',
}
```

## State Management Pattern

Uses **Zustand** for state management. Stores are in `apps/browser-extension/src/stores/`.

### Example: Quote Store Pattern
```typescript
import { create } from 'zustand';
import { getQuotes, setQuotes } from '@cuewise/storage';
import { getRandomQuote } from '@cuewise/shared';

interface QuoteStore {
  quotes: Quote[];
  currentQuote: Quote | null;
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;
  refreshQuote: () => Promise<void>;
  toggleFavorite: (quoteId: string) => Promise<void>;
}

export const useQuoteStore = create<QuoteStore>((set, get) => ({
  quotes: [],
  currentQuote: null,
  isLoading: true,

  initialize: async () => {
    // Load from storage, seed if empty
    let quotes = await getQuotes();
    if (quotes.length === 0) {
      quotes = SEED_QUOTES;
      await setQuotes(quotes);
    }
    set({ quotes, isLoading: false });
  },

  // Other actions...
}));
```

**Key Pattern**:
- Store handles both local state AND persistence
- Uses storage helpers from `@cuewise/storage`
- Uses business logic from `@cuewise/shared`

## Error Handling & Logging Pattern

### Use the Logger, Not console.error

**IMPORTANT**: Never use `console.error`, `console.log`, `console.warn`, or `console.debug` directly. Always use the project's logger from `@cuewise/shared`:

```typescript
import { logger } from '@cuewise/shared';

// CORRECT
logger.error('Error updating settings', error);
logger.warn('Deprecated API usage');
logger.info('User logged in');
logger.debug('Debug info', { userId: 123 });

// WRONG - Never use console directly
console.error('Error:', error);
console.log('Debug:', data);
```

The logger:
- Can be controlled via settings (log level: none, error, warn, info, debug)
- Provides consistent formatting with timestamps and prefixes
- Can be extended to integrate with services like Sentry or LogRocket
- Respects user preferences for logging verbosity

**Location**: `packages/shared/src/logger.ts`

### Unified Error Handling with Toast Store

**Problem**: Avoid repetitive error handling patterns where we call both logger and toast separately:

```typescript
// AVOID THIS PATTERN:
const errorMessage = 'Failed to load quotes';
logger.error(errorMessage, error);
useToastStore.getState().error(errorMessage);
```

**Solution**: The `toast-store` automatically logs all messages to the console, providing a unified approach for error handling, warnings, and success messages.

**Location**: `apps/browser-extension/src/stores/toast-store.ts`

### Toast Store Pattern

```typescript
import { logger } from '@cuewise/shared';
import { useToastStore } from '../stores/toast-store';

// In Zustand store actions
try {
  await setSettings(updatedSettings);
  set({ settings: updatedSettings });
} catch (error) {
  logger.error('Error updating settings', error);
  const errorMessage = 'Failed to update settings. Please try again.';
  set({ error: errorMessage });
  useToastStore.getState().error(errorMessage);
}
```

**Key Features**:
- **Controllable logging**: Logger respects user's log level settings
- **Type-safe**: Uses TypeScript for error typing
- **Consistent UX**: User sees toast notification, developer sees formatted logs
- **Three severity levels**: `error`, `warning`, `success`

### Best Practices

1. **Always log the underlying error object** first with `logger.error()` for debugging
2. **Create user-friendly error messages** for the toast notification
3. **Use toast store for user-facing feedback**:
   ```typescript
   useToastStore.getState().error('User-friendly message');
   useToastStore.getState().warning('Warning message');
   useToastStore.getState().success('Success message');
   ```

4. **Pattern for store error handling**:
   ```typescript
   try {
     // operation
     await someAsyncOperation();
   } catch (error) {
     logger.error('Error context for debugging', error);
     const errorMessage = 'User-friendly error message';
     set({ error: errorMessage }); // Update store error state
     useToastStore.getState().error(errorMessage); // Show user notification
   }
   ```

5. **Don't duplicate logging**: Since toast store logs automatically, avoid calling both `logger` and toast for the same message

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
- Uses **Tailwind CSS** utility classes
- Category colors from `CATEGORY_COLORS` constant
- `cn()` helper for conditional classes (from `@cuewise/ui`)

```typescript
const categoryColor = CATEGORY_COLORS[quote.category];

<span
  className={cn(
    'rounded-full transition-all',
    isFavorite ? 'bg-red-500' : 'bg-white'
  )}
  style={{ backgroundColor: categoryColor }}
>
  {category}
</span>
```

## Common Development Tasks

### Adding a New Feature

1. **Add types** to `packages/shared/src/types.ts`
2. **Add business logic** to `packages/shared/src/utils.ts`
3. **Add storage helpers** to `packages/storage/src/storage-helpers.ts`
4. **Create Zustand store** in `apps/browser-extension/src/stores/`
5. **Create components** in `apps/browser-extension/src/components/`
6. **Wire up in App.tsx**

### Adding a New Shared Package

```bash
# Create package directory
mkdir -p packages/new-package/src

# Create package.json
{
  "name": "@cuewise/new-package",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "dependencies": {
    "@cuewise/shared": "workspace:*"
  }
}

# Update pnpm-workspace.yaml (already includes packages/*)
```

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

**Use fixtures to eliminate duplication and improve maintainability.** Store reusable test data, mock builders, and assertion helpers in `__fixtures__` directories alongside test files.

**Example Structure**:
```
src/
  stores/
    __fixtures__/
      quote-store.fixtures.ts    # Reusable test helpers for store tests
    quote-store.ts
    quote-store.test.ts
  components/
    __fixtures__/
      quote-display.fixtures.ts  # Reusable mocks for component tests
    QuoteDisplay.tsx
    QuoteDisplay.test.tsx
```

**Fixture Categories**:

1. **Test Data Builders** - Create consistent test data
```typescript
// quote-store.fixtures.ts
export function createNavigationQuotes(count = 3) {
  const quotes = quoteFactory.buildList(count);
  return {
    quotes,
    quote1: quotes[0],
    quote2: quotes[1],
    quote3: quotes[2],
  };
}
```

2. **State Presets** - Pre-configured states for common scenarios
```typescript
export const EMPTY_STORE_STATE = {
  quotes: [],
  currentQuote: null,
  isLoading: true,
  error: null,
  quoteHistory: [],
  historyIndex: 0,
};

export function createAtBeginningState(quotes: Quote[], history: Quote[]) {
  return {
    quotes,
    currentQuote: history[0],
    quoteHistory: history.map(q => q.id),
    historyIndex: 0,  // At most recent
    isLoading: false,
    error: null,
  };
}
```

3. **Mock Builders** - Create mocks with sensible defaults
```typescript
// quote-display.fixtures.ts
export function createLoadedMockStore(quote?: Quote) {
  const currentQuote = quote || quoteFactory.build();
  return {
    currentQuote,
    quotes: [currentQuote],
    isLoading: false,
    error: null,
    goBack: vi.fn(),
    goForward: vi.fn(),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    // ... other methods
  };
}
```

4. **Assertion Helpers** - Reusable test assertions
```typescript
export function expectNavigationToQuote(
  state: any,
  expectedQuote: Quote,
  expectedIndex: number
) {
  expect(state.currentQuote?.id).toBe(expectedQuote.id);
  expect(state.historyIndex).toBe(expectedIndex);
}
```

5. **Test Scenarios** - Complex test setups
```typescript
export function createHiddenQuoteScenario() {
  const visibleQuotes = quoteFactory.buildList(2);
  const hiddenQuote = quoteFactory.build({ isHidden: true });

  return {
    allQuotes: [visibleQuotes[0], hiddenQuote, visibleQuotes[1]],
    visibleQuotes,
    hiddenQuote,
    history: [visibleQuotes[0].id, hiddenQuote.id, visibleQuotes[1].id],
  };
}
```

**Usage in Tests**:
```typescript
import { createNavigationQuotes, expectNavigationToQuote } from './__fixtures__/quote-store.fixtures';

it('should navigate to previous quote', async () => {
  const { quotes, quote1, quote2 } = createNavigationQuotes(2);
  const state = createAtBeginningState(quotes, [quote1, quote2]);

  useQuoteStore.setState(state);
  await useQuoteStore.getState().goBack();

  const newState = useQuoteStore.getState();
  expectNavigationToQuote(newState, quote2, 1);
});
```

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

### Adding Web App

1. Create `apps/web` with Next.js
2. Use `LocalStorageAdapter` for storage
3. Reuse all `@cuewise/shared` logic
4. Reuse `@cuewise/ui` components
5. Add routing with Next.js App Router

### Adding Mobile App

1. Create `apps/mobile` with React Native
2. Use `AsyncStorageAdapter` for storage
3. Reuse all `@cuewise/shared` logic
4. Create `packages/ui-native` OR use cross-platform UI library (Tamagui/NativeWind)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed multi-platform strategy.

## Key Files Reference

| File | Purpose | When to Edit |
|------|---------|--------------|
| `packages/shared/src/types.ts` | Core data types | Adding new entities/interfaces |
| `packages/shared/src/constants.ts` | Shared constants | Adding categories, defaults |
| `packages/shared/src/utils.ts` | Business logic utilities | Adding platform-agnostic functions |
| `packages/storage/src/storage-helpers.ts` | Typed storage helpers | Adding new storage operations |
| `apps/browser-extension/src/stores/` | State management | Adding new features with state |
| `apps/browser-extension/src/components/` | UI components | Adding new UI elements |
| `apps/browser-extension/manifest.json` | Extension config | Changing permissions/behavior |
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

For manual testing, visual verification, and browser automation, you can use Playwright to interact with the extension via the dev server:

### Starting the Dev Server

**Important**: Always check if the dev server is already running before starting it:

```bash
# Check if port 5173 is in use
lsof -i :5173

# If nothing is returned, start the dev server
pnpm --filter @cuewise/browser-extension dev
```

The dev server will start on `http://localhost:5173/` with hot module replacement (HMR) enabled.

### Testing with Playwright

1. **Navigate to the extension**
   ```javascript
   await page.goto('http://localhost:5173/');
   ```

2. **Interact with features**
   ```javascript
   // Navigate to Pomodoro timer
   await page.getByRole('button', { name: 'Pomodoro' }).click();

   // Switch density modes
   await page.getByRole('button', { name: 'Compact' }).click();
   await page.getByRole('button', { name: 'Spacious' }).click();

   // Take screenshots for verification
   await page.screenshot({ path: 'screenshot.png' });
   ```

3. **Test responsive features**
   - Click "Pomodoro" to access the Pomodoro timer
   - Click "Menu" to access settings panel
   - Test density modes (Compact/Comfortable/Spacious)
   - Switch between light/dark modes
   - Test all color themes
   - Verify layouts and animations

### Benefits of Dev Server Testing

- ✅ **Instant Hot Reload**: Changes reflect immediately without rebuilding
- ✅ **Better Debugging**: Source maps, console logs, detailed error messages
- ✅ **Faster Iteration**: No need to reload extension in Chrome
- ✅ **Browser Automation**: Compatible with Playwright, Puppeteer, Selenium
- ✅ **Visual Testing**: Easy to capture screenshots and verify layouts

### Important Notes

- **Dev Server vs Production**: The dev server uses Vite's HMR. For production testing, load the built extension from `apps/browser-extension/dist` as an unpacked extension in Chrome.
- **Port Conflicts**: If port 5173 is in use, Vite will automatically try another port. Check the terminal output for the actual port number.
- **Stop Dev Server**: Use `Ctrl+C` in the terminal or kill the process when done.

## Package Naming Convention

- **Apps**: `@cuewise/browser-extension`, `@cuewise/web`, `@cuewise/mobile`
- **Shared**: `@cuewise/shared`, `@cuewise/storage`, `@cuewise/ui`
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

**Last Updated**: 2025-11-16

This guide should give you (Claude) a solid understanding of the codebase structure, patterns, and conventions. When in doubt, refer to existing code in similar contexts.
