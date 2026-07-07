# @cuewise/storage

Storage for Cuewise, built on the platform **KeyValueStore** seam. The
`ChromeKeyValueStore` adapter self-registers as the default backend on import, so
the browser extension needs no setup; a future Tauri/RN app swaps in its own
adapter via `configurePlatform` from `@cuewise/shared`.

## Typed helpers (use these)

Feature code uses the typed helpers, not the store directly:

```typescript
import { getReminders, setReminders } from '@cuewise/storage';

const reminders = await getReminders();
const result = await setReminders(updated); // StorageResult: { success, error? }
```

## The KeyValueStore seam

The port lives in `@cuewise/shared` (area-aware, returns a typed `StorageResult`):

```typescript
interface KeyValueStore {
  get<T>(key: string, area: StorageArea): Promise<T | null>;
  set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult>;
  remove(key: string, area: StorageArea): Promise<boolean>;
  getUsage(area: StorageArea): Promise<StorageUsage>;
}
```

- `ChromeKeyValueStore` (this package) wraps `chrome.storage.local`/`sync` with a
  `localStorage` dev fallback, and self-registers as the default on import.
- Override on another platform:
  `configurePlatform({ storage: new TauriKeyValueStore() })` after importing
  `@cuewise/storage`.

## Low-level access

`getFromStorage` / `setInStorage` / `removeFromStorage` are thin delegators over
`getStorage()`, for the rare cases the typed helpers don't cover.
