import {
  configurePlatform,
  DEFAULT_SETTINGS,
  type Goal,
  STORAGE_KEYS,
  toStoredValues,
} from '@cuewise/shared';
import {
  getGoals,
  getManyFromStorage,
  getSettings,
  getSettingsForSync,
  SETTINGS_KEYS,
  setCollectionsRaw,
  setGoals,
  setGoalsRaw,
  setManyInStorage,
  setQuotes,
  setQuotesRaw,
  setRemindersRaw,
  setSettingsPatch,
  settingsStorageKey,
  updateGoals,
  updateQuotes,
} from '@cuewise/storage';
import { goalFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { DEVICE_LOCAL_SETTINGS_KEYS, defaultBindings } from './collections';

beforeEach(() => {
  configurePlatform({ storage: new FakeKvStore() });
});

function goalsBinding() {
  const binding = defaultBindings().find((b) => b.name === 'goals');
  if (binding === undefined) {
    throw new Error('goals binding missing from defaultBindings()');
  }
  return binding;
}

function quotesBinding() {
  const binding = defaultBindings().find((b) => b.name === 'quotes');
  if (binding === undefined) {
    throw new Error('quotes binding missing from defaultBindings()');
  }
  return binding;
}

function settingsBinding() {
  const binding = defaultBindings().find((b) => b.name === 'settings');
  if (binding === undefined) {
    throw new Error('settings binding missing from defaultBindings()');
  }
  return binding;
}

describe('goals binding', () => {
  it('readAll returns id -> goal for seeded goals', async () => {
    const g1 = goalFactory.build({ id: 'g1' });
    const g2 = goalFactory.build({ id: 'g2' });
    await setGoals([g1, g2]);

    const result = await goalsBinding().readAll();

    expect(result).toEqual({ g1, g2 });
  });

  // The raw readers validate shape, not content, so an unusable id reaches the push: an empty
  // one fails validation for the whole batch, a missing one syncs a row every peer appends.
  it('readAll skips a stored row with no usable id rather than keying it as undefined', async () => {
    const g1 = goalFactory.build({ id: 'g1' });
    await setGoals([g1, { title: 'no id at all' } as unknown as Goal, { id: '' } as Goal]);

    const result = await goalsBinding().readAll();

    expect(Object.keys(result)).toEqual(['g1']);
  });

  it('writeOne appends a new goal', async () => {
    const g1 = goalFactory.build({ id: 'g1' });
    await setGoals([g1]);
    const g3 = goalFactory.build({ id: 'g3' });

    await goalsBinding().writeOne('g3', g3);

    const goals = await getGoals();
    expect(goals).toEqual([g1, g3]);
  });

  it('writeOne replaces an existing goal in place', async () => {
    const g1 = goalFactory.build({ id: 'g1', text: 'original' });
    const g2 = goalFactory.build({ id: 'g2' });
    await setGoals([g1, g2]);
    const edited = { ...g1, text: 'edited' };

    await goalsBinding().writeOne('g1', edited);

    const goals = await getGoals();
    expect(goals).toEqual([edited, g2]);
  });

  it('writeOne removes a goal when entity is null', async () => {
    const g1 = goalFactory.build({ id: 'g1' });
    const g2 = goalFactory.build({ id: 'g2' });
    await setGoals([g1, g2]);

    await goalsBinding().writeOne('g1', null);

    const goals = await getGoals();
    expect(goals).toEqual([g2]);
  });
});

describe('settings binding', () => {
  it('readAll excludes device-local keys', async () => {
    const result = await settingsBinding().readAll();

    expect(result.cloudSyncEnabled).toBeUndefined();
    expect(result.syncEnabled).toBeUndefined();
    expect(result.theme).toEqual({ key: 'theme', value: DEFAULT_SETTINGS.theme });
  });

  it('readBackfillIds claims stored keys but never device-local or unwritten ones', async () => {
    await setSettingsPatch({ theme: 'dark', syncEnabled: true });

    await expect(settingsBinding().readBackfillIds?.()).resolves.toEqual(['theme']);
  });

  // 'dark', not 'forest': the latter is a colorTheme, so it would assert the validator.
  it('writeOne writes only its own key and leaves the others absent', async () => {
    await settingsBinding().writeOne('theme', { key: 'theme', value: 'dark' });

    const stored = await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey));

    expect(stored).toEqual(toStoredValues({ 'settings.theme': 'dark' }));
  });

  it('writeOne leaves every other setting on its default', async () => {
    await settingsBinding().writeOne('theme', { key: 'theme', value: 'dark' });

    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.colorTheme).toBe(DEFAULT_SETTINGS.colorTheme);
  });

  // A peer on another version is not wrong for holding a value our schema does not cover, and
  // a refused write would stall the pull cycle on that record forever.
  it('lands a pulled value this build cannot interpret', async () => {
    const result = await settingsBinding().writeOne('colorTheme', {
      key: 'colorTheme',
      value: 'aurora',
    });

    expect(result.success).toBe(true);
    expect((await getSettingsForSync()).colorTheme).toBe('aurora');
  });

  it('does not overwrite a neighbouring key it cannot interpret', async () => {
    await settingsBinding().writeOne('colorTheme', { key: 'colorTheme', value: 'aurora' });

    await settingsBinding().writeOne('theme', { key: 'theme', value: 'dark' });

    const stored = await getSettingsForSync();
    expect(stored.colorTheme).toBe('aurora');
  });

  it('writeOne is a no-op for a device-local key', async () => {
    const result = await settingsBinding().writeOne('cloudSyncEnabled', {
      key: 'cloudSyncEnabled',
      value: true,
    });

    expect(result).toEqual({ success: true });
  });

  it('writeOne is a no-op when entity is null', async () => {
    const result = await settingsBinding().writeOne('theme', null);

    expect(result).toEqual({ success: true });
    const settings = await getSettings();
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});

// An entity missing from readAll is what the cycle seals as a tombstone for every other device,
// so "I could not read the list" must never arrive here as "the list is empty".
describe('a collection the storage layer could not read', () => {
  beforeEach(async () => {
    const kv = new FakeKvStore();
    configurePlatform({ storage: kv });
    await setGoals([goalFactory.build({ id: 'g1' })]);
    kv.failGetManyForKey = 'goals';
  });

  it('readAll refuses instead of reporting an empty collection', async () => {
    await expect(goalsBinding().readAll()).rejects.toThrow();
  });

  it('writeOne fails instead of rewriting the list from what it could not see', async () => {
    const result = await goalsBinding().writeOne('g2', goalFactory.build({ id: 'g2' }));

    expect(result).toMatchObject({ success: false });
  });
});

describe('defaultBindings', () => {
  it('returns a binding for each synced collection', () => {
    const names = defaultBindings().map((b) => b.name);

    expect(names).toEqual(['goals', 'quotes', 'collections', 'reminders', 'settings']);
  });
});

describe('DEVICE_LOCAL_SETTINGS_KEYS', () => {
  it('includes both sync toggles', () => {
    expect(DEVICE_LOCAL_SETTINGS_KEYS).toContain('syncEnabled');
    expect(DEVICE_LOCAL_SETTINGS_KEYS).toContain('cloudSyncEnabled');
  });
});

// The tests above build entities from factories, which are schema-valid, so the raw/validated
// distinction is invisible to them.
describe('bindings see what the UI cannot', () => {
  const unreadable = { id: 'g-unreadable', text: 'from a newer build', completed: 'nope' };

  async function seedGoals(rows: unknown[]): Promise<void> {
    await setGoalsRaw(rows as never);
  }

  it('readAll includes a stored goal the validated read hides', async () => {
    await seedGoals([goalFactory.build({ id: 'g1' }), unreadable]);

    const all = await goalsBinding().readAll();

    expect(Object.keys(all)).toContain('g-unreadable');
  });

  // Absence from readAll is how the cycle infers a tombstone.
  it('writeOne can delete that same goal', async () => {
    await seedGoals([goalFactory.build({ id: 'g1' }), unreadable]);

    await goalsBinding().writeOne('g-unreadable', null);

    const all = await goalsBinding().readAll();
    expect(Object.keys(all)).not.toContain('g-unreadable');
  });

  // ...and an unrelated write must not quietly resurrect it either.
  it('writeOne of a different goal leaves it in place', async () => {
    await seedGoals([goalFactory.build({ id: 'g1' }), unreadable]);

    await goalsBinding().writeOne('g1', goalFactory.build({ id: 'g1', text: 'edited' }));

    const all = await goalsBinding().readAll();
    expect(Object.keys(all)).toContain('g-unreadable');
  });

  it('settings readAll exposes a value this build cannot parse', async () => {
    await setManyInStorage({ [settingsStorageKey('colorTheme')]: 'aurora' }, 'local');

    const all = await settingsBinding().readAll();

    expect((all.colorTheme as { value: unknown }).value).toBe('aurora');
  });

  // An absent key is how a default is expressed, so a pulled default still has to be written.
  it('lands a pulled value that happens to equal our own default', async () => {
    await setManyInStorage({ [settingsStorageKey('colorTheme')]: 'aurora' }, 'local');

    await settingsBinding().writeOne('colorTheme', {
      key: 'colorTheme',
      value: DEFAULT_SETTINGS.colorTheme,
    });

    const stored = await getSettingsForSync();
    expect(stored.colorTheme).toBe(DEFAULT_SETTINGS.colorTheme);
  });
});

/** The same three properties as the goals block, across the other three array bindings. */
describe.each([
  [
    'quotes',
    setQuotesRaw,
    { id: 'unreadable', text: 'newer build', isCustom: true, category: 'x' },
  ],
  ['collections', setCollectionsRaw, { id: 'unreadable', name: 'newer build', createdAt: 42 }],
  [
    'reminders',
    setRemindersRaw,
    { id: 'unreadable', text: 'newer build', dueDate: 'x', completed: 'nope' },
  ],
])('the %s binding sees what the UI cannot', (name, seedRaw, unreadable) => {
  function binding() {
    const found = defaultBindings().find((b) => b.name === name);
    if (found === undefined) {
      throw new Error(`${name} binding missing from defaultBindings()`);
    }
    return found;
  }

  beforeEach(async () => {
    await seedRaw([unreadable] as never);
  });

  it('readAll includes it', async () => {
    expect(Object.keys(await binding().readAll())).toContain('unreadable');
  });

  // Absence from readAll is how the cycle infers a tombstone, so a hidden entity would be
  // pushed as a delete and removed on every other device.
  it('writeOne can delete it', async () => {
    await binding().writeOne('unreadable', null);

    expect(Object.keys(await binding().readAll())).not.toContain('unreadable');
  });

  it('an unrelated write leaves it in place', async () => {
    await binding().writeOne('other', { id: 'other' } as never);

    expect(Object.keys(await binding().readAll())).toContain('unreadable');
  });
});

describe('goals binding and the page-side writer share one lock', () => {
  // The race the lock exists for: the worker applies a pull through writeOne while the page edits
  // through updateGoals. Unserialised, whoever writes second replaces the whole array.
  it('lets a pull and a page edit both land', async () => {
    const pulled = goalFactory.build();
    const edited = goalFactory.build();
    await setGoals([]);

    await Promise.all([
      goalsBinding().writeOne(pulled.id, pulled),
      updateGoals((goals) => [...goals, edited]),
    ]);

    const stored = await getGoals();
    expect(stored.map((goal) => goal.id).sort()).toEqual([pulled.id, edited.id].sort());
  });
});

describe('readAll reads under the collection lock', () => {
  // Quotes live in two keys, so a favourite moving between them is briefly in neither. An
  // unlocked readAll reports that absence, and the push cycle seals it as a tombstone every
  // other device applies.
  it('does not observe a quote mid-move between the two quote keys', async () => {
    const kv = new FakeKvStore();
    configurePlatform({ storage: kv });
    const seed = quoteFactory.build({ id: 'seed-1', isCustom: false, isFavorite: false });
    await setQuotes([seed]);

    const original = kv.set.bind(kv);
    let midWrite: Promise<Record<string, unknown>> | null = null;
    vi.spyOn(kv, 'set').mockImplementation(async (key, value, area) => {
      if (key === STORAGE_KEYS.CUSTOM_QUOTES && midWrite === null) {
        midWrite = quotesBinding().readAll();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return original(key, value, area);
    });

    await updateQuotes((current) => current.map((q) => ({ ...q, isFavorite: true })));
    const observed = await midWrite;
    vi.restoreAllMocks();

    expect(Object.keys(observed ?? {})).toEqual(['seed-1']);
  });
});
