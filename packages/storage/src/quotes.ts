import { logger, type Quote, quoteSchema, STORAGE_KEYS, storageFailure } from '@cuewise/shared';
import {
  getManyFromStorage,
  getValidatedFromStorage,
  keepValidListItems,
  removeFromStorage,
  type StorageArea,
  type StorageResult,
  setInStorage,
  setValidatedListInStorage,
} from './chrome-storage';
import { withCollectionLock } from './collection-lock';
import { getListRaw } from './raw-list';
import { getStorageArea } from './settings';

// Quotes - Hybrid Storage Strategy
// Seed quotes: Always stored in local storage (same on all devices)
// Custom quotes: Stored in sync/local based on user preference (user-created data)

/**
 * Which quotes belong to the user rather than the seed set: user-created, or a seed quote they
 * favourited or hid. Exported because it decides which key a quote lands in, so anything handing
 * back "the user's quotes" — the export above all — must ask the same question or omit what it stored.
 */
export function isCustomQuote(quote: Quote): boolean {
  return quote.isCustom || quote.isFavorite || quote.isHidden;
}

/**
 * The legacy quotes key in one area: `null` only when it was never written. Throws when the read
 * failed or the value is unreadable — the single-key read conflates those with absence, and this
 * is the path that DELETES the key, so a wrong "nothing here" is not recoverable.
 */
async function readLegacyQuotes(area: StorageArea): Promise<Quote[] | null> {
  const stored = await getManyFromStorage([STORAGE_KEYS.QUOTES], area);
  if (stored === null) {
    logger.error('Could not read the legacy quotes key', { area });
    throw new Error(`Could not read the legacy quotes key in ${area} storage`);
  }
  const entry = stored[STORAGE_KEYS.QUOTES];
  if (entry === undefined) {
    return null;
  }
  if (!entry.readable) {
    logger.error('The legacy quotes key is stored but unreadable', { area });
    throw new Error(`The legacy quotes key in ${area} storage is unreadable`);
  }
  if (!Array.isArray(entry.value)) {
    return null;
  }
  return entry.value as Quote[];
}

/**
 * One leg of the move, merged by id rather than overwritten. Deleting the legacy key is allowed
 * to fail, so this runs again on the next read — and an overwrite would replace everything added
 * to the destination since with the stale legacy copy.
 */
async function moveLegacyQuotesInto(
  key: string,
  incoming: Quote[],
  area: StorageArea
): Promise<void> {
  if (incoming.length === 0) {
    return;
  }
  // Raw: a validated read hides rows this build cannot parse, and the merge would then drop them.
  const existing = await getListRaw<{ id?: unknown }>(key, area);
  const existingIds = new Set(existing.map((item) => item?.id));
  const missing = incoming.filter((quote) => !existingIds.has(quote.id));
  if (missing.length === 0) {
    return;
  }
  const result = await setInStorage(key, [...existing, ...missing], area);
  if (!result.success) {
    logger.error('Quote migration write failed; keeping the legacy key', result.error);
    throw new Error(`Could not migrate the legacy quotes: ${result.error.message}`);
  }
}

/**
 * Migrate legacy quotes storage to hybrid storage
 * Called automatically when old 'quotes' key is detected
 */
async function migrateLegacyQuotes(): Promise<void> {
  // Raw, and this one matters more than the other movers: the legacy key is REMOVED at
  // the end, so a quote dropped from the copy is not quarantined anywhere — it is gone.
  // Every other validated read leaves the bytes on disk to be salvaged later.
  // readLegacyQuotes throws on a failed local read, so sync can only stand in for a local key
  // that was never written — never for one this build could not see.
  const localQuotes = await readLegacyQuotes('local');
  const syncQuotes = await readLegacyQuotes('sync');
  const legacyQuotes = localQuotes ?? syncQuotes;

  if (legacyQuotes === null || legacyQuotes.length === 0) {
    return; // No migration needed
  }

  logger.info('Migrating legacy quotes to hybrid storage...');

  // Split into seed and custom quotes
  const seedQuotes = legacyQuotes.filter((q) => !isCustomQuote(q));
  const customQuotes = legacyQuotes.filter((q) => isCustomQuote(q));

  // Every write is checked before the delete below: the legacy key is the only copy, so a
  // dropped result would trade a failed write for lost quotes.
  await moveLegacyQuotesInto(STORAGE_KEYS.SEED_QUOTES, seedQuotes, 'local');
  if (customQuotes.length > 0) {
    await moveLegacyQuotesInto(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, await getStorageArea());
  }

  const removedLocal = await removeFromStorage(STORAGE_KEYS.QUOTES, 'local');
  const removedSync = await removeFromStorage(STORAGE_KEYS.QUOTES, 'sync');
  if (!removedLocal || !removedSync) {
    // Emptied, not left in place: the copies landed, so a surviving legacy key makes the next read
    // re-add a quote deleted since — or duplicate into the sibling key one favouriting had moved.
    logger.error('Migrated the legacy quotes but could not delete the legacy key; emptying it');
    if (!removedLocal) {
      await setInStorage(STORAGE_KEYS.QUOTES, [], 'local');
    }
    if (!removedSync) {
      await setInStorage(STORAGE_KEYS.QUOTES, [], 'sync');
    }
  }

  logger.info(
    `Migration complete: ${seedQuotes.length} seed quotes, ${customQuotes.length} custom quotes`
  );
}

/**
 * Throws rather than answering `[]` when storage could not be read: an empty answer is what the
 * store seeds on, and seeding rewrites both quote keys — erasing every custom quote.
 */
export async function getQuotes(): Promise<Quote[]> {
  // Raw: this only decides whether to migrate, and the migration itself must see everything that
  // is there. A read it could not make throws rather than skipping the migration silently.
  const legacyQuotes = await readLegacyQuotes('local');
  if (legacyQuotes !== null && legacyQuotes.length > 0) {
    await migrateLegacyQuotes();
  }

  // getListRaw, not the validated read: only a key that was never written reads as empty here.
  const seedRaw = await getListRaw<unknown>(STORAGE_KEYS.SEED_QUOTES, 'local');
  const area = await getStorageArea();
  const customRaw = await getListRaw<unknown>(STORAGE_KEYS.CUSTOM_QUOTES, area);

  return [
    ...keepValidListItems<Quote>(seedRaw, quoteSchema, STORAGE_KEYS.SEED_QUOTES, 'local'),
    ...keepValidListItems<Quote>(customRaw, quoteSchema, STORAGE_KEYS.CUSTOM_QUOTES, area),
  ];
}

/**
 * Changes the quote list, reading inside the lock. See `updateGoals` for why. Calls `mutate`
 * exactly once, so callers may collect ids from inside it.
 */
export async function updateQuotes(
  mutate: (quotes: Quote[]) => Quote[]
): Promise<{ result: StorageResult; quotes: Quote[] }> {
  return withCollectionLock('quotes', async () => {
    const quotes = mutate(await getQuotes());
    return { result: await setQuotes(quotes), quotes };
  });
}

/**
 * The seed key is written first, so a failed custom write leaves the pair inconsistent: a quote
 * this write moved between the keys is now in neither.
 */
async function restoreSeedAfterFailedCustomWrite(
  seedBefore: Quote[] | null,
  seedReadError: unknown,
  customQuotes: Quote[],
  customResult: Extract<StorageResult, { success: false }>
): Promise<void> {
  if (seedBefore === null) {
    logger.error(
      'Quotes are half written and the seed key was unreadable, so it was not restored',
      {
        error: customResult.error,
        seedReadError,
      }
    );
    return;
  }
  const rolledBack = await setInStorage(STORAGE_KEYS.SEED_QUOTES, seedBefore, 'local');
  if (rolledBack.success) {
    return;
  }
  // seedBefore holds the pre-write rows, so an id this write moved to the custom key is one the
  // seed write dropped and the custom write never took.
  const movedToCustom = new Set(customQuotes.map((q) => q.id));
  logger.error('Quotes are half written and the seed key could not be restored', {
    error: customResult.error,
    restoreError: rolledBack.error,
    stranded: seedBefore.filter((q) => movedToCustom.has(q.id)).map((q) => q.id),
  });
}

/** Unreadable means no rollback, not no write — the error is reported only if the write fails. */
async function readSeedForRollback(): Promise<{ quotes: Quote[] | null; error: unknown }> {
  try {
    return { quotes: await getListRaw<Quote>(STORAGE_KEYS.SEED_QUOTES, 'local'), error: null };
  } catch (error) {
    return { quotes: null, error };
  }
}

/** Two keys, written in sequence: a failed custom write rolls the seed key back. */
export async function setQuotes(quotes: Quote[]): Promise<StorageResult> {
  try {
    const seedQuotes = quotes.filter((q) => !isCustomQuote(q));
    const customQuotes = quotes.filter((q) => isCustomQuote(q));
    // Both keys judge preservation against every id this write covers: favouriting moves a quote
    // to the sibling key, and a per-key view would keep its quarantined twin beside the new copy.
    const coveredIds = quotes.map((q) => q.id);

    // Favouriting or hiding a seed quote moves it to the custom key, so the seed write drops it
    // and a custom write that then fails would leave it in neither.
    const seedBefore = await readSeedForRollback();

    const seedResult = await setValidatedListInStorage(
      STORAGE_KEYS.SEED_QUOTES,
      seedQuotes,
      quoteSchema,
      'local',
      coveredIds
    );
    if (!seedResult.success) {
      return seedResult;
    }

    let customResult: StorageResult;
    try {
      const area = await getStorageArea();
      customResult = await setValidatedListInStorage(
        STORAGE_KEYS.CUSTOM_QUOTES,
        customQuotes,
        quoteSchema,
        area,
        coveredIds
      );
    } catch (error) {
      // Rejecting here lands past the seed write just like a false result does, so it needs
      // the same rollback rather than the generic catch below.
      logger.error('Could not write the custom quotes', error);
      customResult = storageFailure('Could not write the custom quotes');
    }

    if (!customResult.success) {
      await restoreSeedAfterFailedCustomWrite(
        seedBefore.quotes,
        seedBefore.error,
        customQuotes,
        customResult
      );
    }
    return customResult;
  } catch (error) {
    logger.error('Error setting quotes', error);
    return storageFailure('Error setting quotes');
  }
}

export async function getCurrentQuote(): Promise<Quote | null> {
  const area = await getStorageArea();
  return getValidatedFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, quoteSchema, area);
}

export async function setCurrentQuote(quote: Quote): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.CURRENT_QUOTE, quote, area);
}

/** Mirrors `setQuotes`'s seed/custom split, without preserving anything. */
export async function setQuotesRaw(quotes: Quote[]): Promise<StorageResult> {
  const seed = quotes.filter((q) => !isCustomQuote(q));
  const custom = quotes.filter((q) => isCustomQuote(q));
  // Same rollback `setQuotes` needs: a reset, or a pull that favourites a seed quote, moves
  // quotes between the keys, and a failed custom write loses whatever the seed write dropped.
  const seedBefore = await readSeedForRollback();
  const seedResult = await setInStorage(STORAGE_KEYS.SEED_QUOTES, seed, 'local');
  if (!seedResult.success) {
    return seedResult;
  }
  let customResult: StorageResult;
  try {
    customResult = await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, custom, await getStorageArea());
  } catch (error) {
    logger.error('Could not write the custom quotes', error);
    customResult = storageFailure('Could not write the custom quotes');
  }
  if (!customResult.success) {
    await restoreSeedAfterFailedCustomWrite(
      seedBefore.quotes,
      seedBefore.error,
      custom,
      customResult
    );
  }
  return customResult;
}

/** Seed plus custom, mirroring `getQuotes`, but without dropping anything. */
export async function getQuotesRaw(): Promise<Quote[]> {
  const [seed, area] = await Promise.all([
    getListRaw<Quote>(STORAGE_KEYS.SEED_QUOTES, 'local'),
    getStorageArea(),
  ]);
  return [...seed, ...(await getListRaw<Quote>(STORAGE_KEYS.CUSTOM_QUOTES, area))];
}
