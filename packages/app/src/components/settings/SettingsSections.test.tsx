import type { Settings } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import { SETTINGS_HOME_WIDGETS, SETTINGS_SECTIONS } from './SettingsSections';
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

// The extension's storage backend supports Chrome sync, so the Advanced row that carries
// the 'chrome sync cloud' terms renders. A backend without it (macOS) hides that row.
vi.mock('@cuewise/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cuewise/shared')>()),
  getStorage: () => ({ supportsSync: true }),
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

// Mirrors the section filter in ../SettingsModal — drifts silently if that changes.
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
    // (SettingControls.tsx). A term no row carries opens the section onto an empty panel.
    // Words already in the section's label are excluded: those surface it via label matching
    // whatever `terms` says, so they can only be fixed structurally, not with keywords.
    it.each(
      SETTINGS_SECTIONS.flatMap(
        (s) =>
          [
            [s.id, true],
            [s.id, false],
          ] as const
      )
    )('every search term in %s reaches a row (focus on: %s)', (id, focusModeEnabled) => {
      const section = sectionById(id);
      const labelWords = new Set(section.label.toLowerCase().split(/[^a-z0-9]+/));
      const orphans = [...new Set(section.terms.split(' '))]
        .filter((term) => !labelWords.has(term))
        .filter((term) => {
          const { container, unmount } = renderSection(id, term, { focusModeEnabled });
          const rendered = container.textContent?.trim() ?? '';
          unmount();
          return rendered.length === 0;
        });

      expect(orphans).toEqual([]);
    });
  });

  describe('Home', () => {
    it('renders every catalogued widget row with its help text', () => {
      renderSection('home');

      for (const widget of SETTINGS_HOME_WIDGETS) {
        expect(screen.getByText(widget.label)).toBeInTheDocument();
        expect(screen.getByText(widget.help)).toBeInTheDocument();
      }
    });

    it('leaves calendar out, since the goals area owns that toggle', () => {
      renderSection('home');

      expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
    });

    it('keeps the weather sub-group behind its toggle', () => {
      renderSection('home', '', { showWeather: false });

      expect(screen.queryByText('Units')).not.toBeInTheDocument();
    });

    it('reveals the weather sub-group once weather is on', () => {
      renderSection('home', '', { showWeather: true });

      expect(screen.getByText('Units')).toBeInTheDocument();
    });
  });
});
