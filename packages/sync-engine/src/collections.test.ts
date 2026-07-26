import { configurePlatform, DEFAULT_SETTINGS } from '@cuewise/shared';
import { getGoals, getSettings, getSettingsForSync, setGoals } from '@cuewise/storage';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it } from 'vitest';
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

  // 'dark', not 'forest': the latter is a colorTheme, and now that reads validate per field
  // an invalid theme is correctly refused on the way out — which would make this assert the
  // validator rather than the binding.
  it('writeOne updates only the targeted key', async () => {
    await settingsBinding().writeOne('theme', { key: 'theme', value: 'dark' });

    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.colorTheme).toBe(DEFAULT_SETTINGS.colorTheme);
  });

  // The binding rewrites the whole settings object, so a value this build does not
  // recognise — from a newer peer — must survive the round trip rather than being written
  // back as our default on every device.
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
