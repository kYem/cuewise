# @cuewise/storage

Platform-agnostic storage package with adapters for multiple platforms.

## Adapters

### Chrome Storage Adapter (Browser Extensions)
```typescript
import { ChromeStorageAdapter, StorageManager } from '@cuewise/storage';

const storage = new StorageManager(new ChromeStorageAdapter('local'));
```

### Local Storage Adapter (Web Apps)
```typescript
import { LocalStorageAdapter, StorageManager } from '@cuewise/storage';

const storage = new StorageManager(new LocalStorageAdapter());
```

### AsyncStorage Adapter (React Native)
```typescript
import { AsyncStorageAdapter, StorageManager } from '@cuewise/storage';

const storage = new StorageManager(new AsyncStorageAdapter());
```

## Usage

All adapters implement the same interface:

```typescript
// Get data
const quotes = await storage.get<Quote[]>('quotes');

// Set data
await storage.set('quotes', quotesArray);

// Remove data
await storage.remove('quotes');

// Clear all data
await storage.clear();

// Listen to changes (if supported by adapter)
storage.onChange((changes) => {
  console.log('Storage changed:', changes);
});
```

## Typed Helpers

For convenience, the package also exports typed helpers that work with any adapter:

```typescript
import { getQuotes, setQuotes, getGoals, setGoals } from '@cuewise/storage';

// These still work for backward compatibility but use the Chrome adapter by default
const quotes = await getQuotes();
```
