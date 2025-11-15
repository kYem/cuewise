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

## Testing Strategy (Future)

When adding tests:
- **`packages/shared`**: Unit tests (pure functions, platform-agnostic)
- **Storage adapters**: Integration tests per platform
- **Components**: Component tests with React Testing Library
- **Stores**: State management tests

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

**Last Updated**: 2025-01-15

This guide should give you (Claude) a solid understanding of the codebase structure, patterns, and conventions. When in doubt, refer to existing code in similar contexts.
