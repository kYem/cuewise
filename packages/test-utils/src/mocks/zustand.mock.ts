import type { Settings } from '@cuewise/shared';
import { vi } from 'vitest';
import { defaultSettings } from '../fixtures';

/**
 * Selector-aware mock for a Zustand hook: supports both `useStore()` and
 * `useStore(selector)`, and exposes `getState()` for code that reads the
 * store imperatively. Wire it up at runtime via
 * `vi.mocked(useStore).mockImplementation(createSelectorMock(state))`.
 */
export function createSelectorMock<S>(state: S) {
  // biome-ignore lint/suspicious/noExplicitAny: selector is typed against the caller's store shape, not S
  const mock = (selector?: (s: any) => unknown) => (selector ? selector(state) : state);
  mock.getState = () => state;
  return mock;
}

/**
 * Selector-aware mock for `useSettingsStore`. Returns `{ settings, updateSettings }`;
 * pass an `updateSettings` spy via overrides when a test needs to assert on it.
 */
export function createSettingsStoreMock(
  overrides: Partial<Settings> & { updateSettings?: ReturnType<typeof vi.fn> } = {}
) {
  const { updateSettings, ...settingsOverrides } = overrides;
  return createSelectorMock({
    settings: { ...defaultSettings, ...settingsOverrides },
    updateSettings: updateSettings ?? vi.fn(),
  });
}
