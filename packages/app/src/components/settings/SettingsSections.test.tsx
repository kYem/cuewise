import type { Settings } from '@cuewise/shared';
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
  clearCustomBackground: vi.fn(),
}));

vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
  },
}));

const BACKGROUND_ROWS = ['Background', 'Your own image', 'Readability'];
const FOCUS_GATED_ROWS = ['Show quote', 'Show current goal', 'Auto-enter on start'];

function sectionById(id: string) {
  const section = SETTINGS_SECTIONS.find((s) => s.id === id);
  if (!section) {
    throw new Error(`No settings section registered with id "${id}"`);
  }
  return section;
}

function renderSection(id: string, filter = '', settingsOverrides: Partial<Settings> = {}) {
  const section = sectionById(id);
  const props: SettingsSectionProps = {
    s: { ...defaultSettings, ...settingsOverrides },
    set: vi.fn(),
    filter,
    onReset: vi.fn(),
    onOpenSoundsPanel: vi.fn(),
  };
  return render(<section.component {...props} />);
}

// Mirrors SettingsModal.tsx:158 — drifts silently if that filter changes.
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
    // BackgroundSection mounts the real CustomBackgroundPicker, which reads on mount.
    vi.mocked(storage.getCustomBackground).mockResolvedValue(null);
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

    it('documents Glass and focus mode as the surfaces that show the photo', () => {
      renderSection('background');

      expect(
        screen.getByText(/Shown on the Glass theme, and in focus mode on any theme/)
      ).toBeInTheDocument();
    });
  });

  describe('Focus mode', () => {
    it.each(BACKGROUND_ROWS)('does not render the %s row', (label) => {
      renderSection('focus');

      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });

    it('renders the controls the focus toggle gates when it is on', () => {
      renderSection('focus', '', { focusModeEnabled: true });

      expect(screen.getByText('Show quote')).toBeInTheDocument();
      expect(screen.getByText('Show current goal')).toBeInTheDocument();
      expect(screen.getByText('Auto-enter on start')).toBeInTheDocument();
    });

    it.each(FOCUS_GATED_ROWS)('hides the %s row when the toggle is off', (label) => {
      renderSection('focus', '', { focusModeEnabled: false });

      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    it.each([
      'dim',
      'blur',
      'wallpaper',
      'unsplash',
      'scenic',
    ])('surfaces Background and not Focus mode for "%s"', (query) => {
      const matched = sectionsMatching(query);

      expect(matched).toContain('background');
      expect(matched).not.toContain('focus');
    });

    it.each(['fullscreen', 'auto enter'])('still surfaces Focus mode for "%s"', (query) => {
      expect(sectionsMatching(query)).toContain('focus');
    });

    // A section matches on `terms`, then each row re-filters on its own label/help/keywords
    // (SettingControls.tsx:31). A term no row carries opens the section onto an empty panel.
    // Scoped to the sections this change owns; timer/sound/home have pre-existing orphans.
    // Focus mode is checked with its toggle both on and off, because half its rows are gated.
    it.each([
      ['background', true],
      ['focus', true],
      ['focus', false],
    ] as const)('every search term in %s reaches a row (focus on: %s)', (id, focusModeEnabled) => {
      const orphans = [...new Set(sectionById(id).terms.split(' '))].filter((term) => {
        const { container, unmount } = renderSection(id, term, { focusModeEnabled });
        const rendered = container.textContent?.trim() ?? '';
        unmount();
        return rendered.length === 0;
      });

      expect(orphans).toEqual([]);
    });
  });
});
