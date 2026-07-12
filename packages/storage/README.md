# @cuewise/storage

Storage for Cuewise, built on the platform **KeyValueStore** port. On import the
package detects the environment and self-registers a default backend, so the
browser extension needs no setup; a future Tauri/RN app swaps in its own adapter
via `configurePlatform` from `@cuewise/shared`.

## Typed helpers (use these)

Feature code uses the typed helpers, not the store directly:

```typescript
import { getReminders, setReminders } from '@cuewise/storage';

const reminders = await getReminders();
const result = await setReminders(updated); // StorageResult: { success, error? }
```

## The KeyValueStore port

The port lives in `@cuewise/shared` (area-aware, returns a typed `StorageResult`):

```typescript
interface KeyValueStore {
  get<T>(key: string, area: StorageArea): Promise<T | null>;
  set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult>;
  remove(key: string, area: StorageArea): Promise<boolean>;
  getUsage(area: StorageArea): Promise<StorageUsage>;
}
```

- `ChromeKeyValueStore` wraps `chrome.storage.local`/`sync` (browser extension).
- `LocalStorageKeyValueStore` is the dev/web fallback (localStorage).
- On import the package detects `chrome.storage` and registers whichever applies
  as the default backend.
- Override on another platform:
  `configurePlatform({ storage: new TauriKeyValueStore() })` after importing
  `@cuewise/storage`.

## Low-level access

`getFromStorage` / `setInStorage` / `removeFromStorage` are thin delegators over
`getStorage()`, for the rare cases the typed helpers don't cover.
