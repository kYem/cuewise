# Architecture Guide

## Multi-Platform Monorepo Strategy

This project is structured to support **three platforms** from a single codebase:

1. **Browser Extension** (Chrome/Edge) - `apps/browser-extension`
2. **Web App** (Next.js/React) - `apps/web` (coming soon)
3. **Mobile App** (React Native) - `apps/mobile` (coming soon)

## Directory Structure

```
quote-app/
├── apps/                    # Deployable applications
│   ├── browser-extension/  # Browser extension (current)
│   ├── web/               # Web app (future)
│   └── mobile/            # React Native app (future)
│
└── packages/               # Shared libraries
    ├── shared/            # Business logic (pure TypeScript)
    ├── storage/           # Multi-platform storage adapters
    └── ui/                # UI components (web-focused, future native)
```

## Package Responsibilities

### `packages/shared` - Platform-Agnostic Core

**What it contains:**
- TypeScript types and interfaces
- Business logic and utilities
- Constants and configuration
- Pure functions with no platform dependencies

**Why it's shared:**
- Quote categories and data structures are the same across all platforms
- Date formatting utilities work everywhere
- Quote selection algorithms are platform-independent

**Example:**
```typescript
// Usable in extension, web, and mobile
import { Quote, QuoteCategory, getRandomQuote } from '@cuewise/shared';
```

### `packages/storage` - Multi-Platform Storage

**What it contains:**
- The `KeyValueStore` port (defined in `@cuewise/shared/platform`) and its adapters:
  - `ChromeKeyValueStore` - browser extension (chrome.storage.local/sync)
  - `LocalStorageKeyValueStore` - dev/web (localStorage)
  - A future React Native app supplies its own (e.g. AsyncStorage-backed)
- Typed helpers (`getReminders`, `setGoals`, …) that feature code uses

**How it works:** feature code uses the typed helpers; the backend is selected once at bootstrap (see the platform ports below), not constructed per call:
```typescript
import { getQuotes, setQuotes } from '@cuewise/storage';

await setQuotes(quotesArray); // returns a StorageResult { success, error? }
const quotes = await getQuotes();
```

A capability-detected backend self-registers on import (chrome.storage in the
extension, localStorage under the dev server). Another platform overrides it:
```typescript
import { configurePlatform } from '@cuewise/shared';
configurePlatform({ storage: new TauriKeyValueStore() });
```

**Typed helpers:**
```typescript
// Convenience wrappers that work with any adapter
import { getQuotes, setQuotes, getGoals } from '@cuewise/storage';
```

### `packages/ui` - Shared UI Components

**Current state:**
- Web-focused React components with Tailwind CSS
- Works for browser extension and will work for web app
- Icons from Lucide React

**Future considerations for React Native:**

**Option 1: Separate packages**
```
packages/
  ui-web/         # Tailwind components (extension + web)
  ui-native/      # React Native components (mobile)
  ui-shared/      # Shared hooks and logic
```

**Option 2: Cross-platform UI library**
Use a library that works on both web and native:
- **Tamagui** - Universal React components
- **NativeWind** - Tailwind for React Native
- **Gluestack UI** - Cross-platform component library

**Option 3: Conditional exports**
```typescript
// packages/ui/src/Button.web.tsx
export const Button = () => { /* Web version */ };

// packages/ui/src/Button.native.tsx
export const Button = () => { /* Native version */ };
```

## Future Apps

### `apps/web` - Next.js Web Application

**Why:**
- Users who can't or won't install browser extensions
- Better SEO for marketing/landing pages
- Easier sharing and collaboration features

**Stack:**
- Next.js 14+ (App Router)
- React 18+
- Tailwind CSS (same as extension)
- `LocalStorageKeyValueStore` for persistence
- Optional: Backend API for cloud sync

**Shared code:**
- ✅ `packages/shared` - All business logic
- ✅ `packages/storage` - Register `LocalStorageKeyValueStore` via `configurePlatform`
- ✅ `packages/ui` - Reuse all components

### `apps/mobile` - React Native Application

**Why:**
- Productivity on the go
- Quick access to goals and quotes
- Mobile notifications for reminders

**Stack:**
- React Native (Expo recommended)
- React Navigation
- An AsyncStorage-backed `KeyValueStore` adapter for persistence
- Push notifications (expo-notifications) via a `Notifier` adapter

**Shared code:**
- ✅ `packages/shared` - All business logic + platform ports
- ✅ `packages/storage` - Register a native `KeyValueStore` via `configurePlatform`
- ⚠️ `packages/ui` - May need native-specific components

## Code Sharing Strategy

### ✅ Always Shareable

1. **Types and interfaces** (`packages/shared/src/types.ts`)
   ```typescript
   export interface Quote { /* ... */ }
   export interface Goal { /* ... */ }
   ```

2. **Business logic** (`packages/shared/src/utils.ts`)
   ```typescript
   export function getRandomQuote(quotes: Quote[]): Quote | null
   export function calculateStreak(dates: string[]): { current: number }
   ```

3. **Constants** (`packages/shared/src/constants.ts`)
   ```typescript
   export const QUOTE_CATEGORIES = { /* ... */ }
   export const DEFAULT_SETTINGS = { /* ... */ }
   ```

### ⚠️ Platform-Specific (Adapters)

1. **Storage** - Different APIs per platform
   - Browser: `chrome.storage`
   - Web: `localStorage`
   - Mobile: `AsyncStorage`

2. **UI Components** - May need variants
   - Web: Tailwind CSS + HTML
   - Mobile: React Native components + StyleSheet

3. **Navigation** - Different patterns
   - Extension: Single page with modals
   - Web: Next.js App Router
   - Mobile: React Navigation

## Adding a New Platform

### Example: Adding Web App

1. **Create the app**
   ```bash
   cd apps
   npx create-next-app@latest web
   ```

2. **Add workspace dependencies**
   ```json
   {
     "dependencies": {
       "@cuewise/shared": "workspace:*",
       "@cuewise/storage": "workspace:*",
       "@cuewise/ui": "workspace:*"
     }
   }
   ```

3. **Bind the web platform adapters at bootstrap**
   ```typescript
   // apps/web/lib/platform.ts
   import { configurePlatform } from '@cuewise/shared';
   import { LocalStorageKeyValueStore } from '@cuewise/storage';

   configurePlatform({ storage: new LocalStorageKeyValueStore() /* + scheduler, notifier */ });
   ```

4. **Reuse business logic**
   ```typescript
   import { Quote, getRandomQuote } from '@cuewise/shared';
   import { getQuotes } from '@cuewise/storage';

   const quotes = await getQuotes();
   const randomQuote = getRandomQuote(quotes);
   ```

5. **Reuse UI components**
   ```typescript
   import { Button, Card } from '@cuewise/ui';
   ```

## Best Practices

### 1. Keep `packages/shared` Pure
- ❌ Don't import browser APIs (`chrome`, `window`, `document`)
- ❌ Don't import React or UI libraries
- ✅ Only pure TypeScript logic and types

### 2. Use Ports for Platform-Specific Code
- ❌ Don't use `chrome.storage` / `chrome.alarms` / `chrome.notifications` directly in business logic
- ✅ Depend on the platform ports (`KeyValueStore`, `Scheduler`, `Notifier`) and bind adapters via `configurePlatform`

### 3. Test Shared Code Once
- Write tests for `packages/shared` that run on all platforms
- Each adapter should have its own tests

### 4. Document Platform Compatibility
```typescript
/**
 * Get random quote from array
 * @platform all - Works on extension, web, and mobile
 */
export function getRandomQuote(quotes: Quote[]): Quote | null
```

## Cloud Sync (Future)

To sync data across platforms:

1. **Add backend API** (e.g., `apps/api` with tRPC or REST)
2. **Create a CloudKeyValueStore** implementing the `KeyValueStore` port
3. **Implement sync logic** in `packages/shared`
4. **Bind the cloud store** via `configurePlatform`, with a local store as offline fallback

```typescript
// Future: packages/storage/src/cloud-key-value-store.ts
import type { KeyValueStore, StorageArea } from '@cuewise/shared';

export class CloudKeyValueStore implements KeyValueStore {
  constructor(
    private apiClient: ApiClient,
    private fallback: KeyValueStore // Offline fallback
  ) {}

  async get<T>(key: string, area: StorageArea): Promise<T | null> {
    try {
      return await this.apiClient.get(key);
    } catch {
      return this.fallback.get<T>(key, area);
    }
  }
  // set / remove / getUsage …
}
```

## Summary

This architecture enables:

- ✅ **Maximum code reuse** across platforms
- ✅ **Type safety** everywhere with TypeScript
- ✅ **Platform flexibility** through adapters
- ✅ **Easy testing** of shared business logic
- ✅ **Independent deployment** of each app
- ✅ **Consistent user experience** across platforms

The monorepo structure makes it easy to add new platforms while maintaining a single source of truth for business logic.
