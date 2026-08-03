import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import { SETTINGS_SECTIONS } from './SettingsSections';
import { settingsMatch } from './settings-match';
import type { SettingsSectionProps } from './settings-types';

vi.mock('@cuewise/storage', () => ({
  clearSettings: vi.fn(),
  getSettings: vi.fn(),
  migrateStorageData: vi.fn(),
  readSettings: vi.fn(),
  setSettingsPatch: vi.fn(),
  getCustomBackground: vi.fn(),
  setCustomBackground: vi.fn(),
  removeCustomBackground: vi.fn(),
}));

vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
  },
}));

const BACKGROUND_ROWS = ['Background', 'Your own image', 'Readability'];

function sectionById(id: string) {
  const section = SETTINGS_SECTIONS.find((s) => s.id === id);
  if (!section) {
    throw new Error(`No settings section registered with id "${id}"`);
  }
  return section;
}

function renderSection(id: string, filter = '') {
  const section = sectionById(id);
  const props: SettingsSectionProps = {
    s: defaultSettings,
    set: vi.fn(),
    filter,
    onReset: vi.fn(),
    onOpenSoundsPanel: vi.fn(),
  };
  return render(<section.component {...props} />);
}

/** How SettingsModal decides which sections a search surfaces. */
function sectionsMatching(query: string) {
  return SETTINGS_SECTIONS.filter((s) => settingsMatch(query, s.label, s.terms)).map((s) => s.id);
}

describe('settings sections', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: defaultSettings,
      preview: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    vi.mocked(storage.setSettingsPatch).mockResolvedValue({ success: true });
    vi.mocked(storage.readSettings).mockResolvedValue({ ok: true, settings: defaultSettings });
  });

  describe('Background', () => {
    it('is registered between Sound & music and Focus mode', () => {
      const ids = SETTINGS_SECTIONS.map((s) => s.id);

      expect(ids.indexOf('background')).toBe(ids.indexOf('sound') + 1);
      expect(ids.indexOf('focus')).toBe(ids.indexOf('background') + 1);
    });

    it.each(BACKGROUND_ROWS)('renders the %s row', (label) => {
      renderSection('background');

      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('says where the photo actually appears', () => {
      renderSection('background');

      expect(
        screen.getByText(/Shown on the Glass theme, and in focus mode on any theme/)
      ).toBeInTheDocument();
    });
  });

  describe('Focus mode', () => {
    it.each(BACKGROUND_ROWS)('no longer renders the %s row', (label) => {
      renderSection('focus');

      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });

    it('keeps the controls the focus toggle genuinely gates', () => {
      renderSection('focus');

      expect(screen.getByText('Show quote')).toBeInTheDocument();
      expect(screen.getByText('Show current goal')).toBeInTheDocument();
      expect(screen.getByText('Auto-enter on start')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it.each([
      'dim',
      'blur',
      'wallpaper',
      'unsplash',
    ])('surfaces Background and not Focus mode for "%s"', (query) => {
      const matched = sectionsMatching(query);

      expect(matched).toContain('background');
      expect(matched).not.toContain('focus');
    });

    it.each(['fullscreen', 'auto enter'])('still surfaces Focus mode for "%s"', (query) => {
      expect(sectionsMatching(query)).toContain('focus');
    });
  });
});
