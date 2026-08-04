import type { Settings } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackgroundStore } from '../stores/background-store';
import { useCalendarStore } from '../stores/calendar-store';
import { useFocusModeStore } from '../stores/focus-mode-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { isCalendarFeatureEnabled } from '../utils/google-calendar';
import { preloadImages } from '../utils/image-preload-cache';
import { PLAIN_THEMES } from './__fixtures__/color-theme.fixtures';
import { PomodoroPage } from './PomodoroPage';

vi.mock('../stores/quote-store', () => ({ useQuoteStore: vi.fn() }));
vi.mock('../stores/settings-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stores/settings-store')>()),
  useSettingsStore: vi.fn(),
}));
vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../stores/focus-mode-store', () => ({ useFocusModeStore: vi.fn() }));
vi.mock('../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn() }));
// The background effect resolves today's image before reading the cache; both are stubbed
// so the effect actually runs (a missing preloadImages would throw once isLoaded is true).
vi.mock('../utils/image-preload-cache', () => ({
  getPreloadedCurrentUrl: () => 'preloaded.jpg',
  preloadImages: vi.fn(() => Promise.resolve()),
}));
vi.mock('../stores/background-store', () => ({ useBackgroundStore: vi.fn() }));
vi.mock('../utils/unsplash', () => ({ loadImageWithFallback: () => Promise.resolve('img.jpg') }));

// Stub heavy children so the test isolates the companion-selection logic.
vi.mock('./CalendarStrip', () => ({
  CalendarStrip: ({ lean, variant }: { lean?: boolean; variant?: string }) => (
    <div data-testid="calendar-strip" data-lean={lean ? 'true' : 'false'} data-variant={variant} />
  ),
}));
vi.mock('./QuoteDisplay', () => ({
  QuoteDisplay: ({ hideCategory }: { hideCategory?: boolean }) => (
    <div data-testid="quote-display" data-hide-category={hideCategory ? 'true' : 'false'} />
  ),
}));
vi.mock('./FocusMode', () => ({ FocusMode: () => null }));
vi.mock('./PomodoroTimer', () => ({
  PomodoroTimer: ({ variant }: { variant?: string }) => (
    <div data-testid="pomodoro-timer" data-variant={variant} />
  ),
}));
vi.mock('./PageHeader', () => ({
  PageHeader: ({ transparent }: { transparent?: boolean }) => (
    <div data-testid="page-header" data-transparent={transparent} />
  ),
}));
vi.mock('./sounds', () => ({
  SoundsMiniPlayer: ({ variant }: { variant?: string }) => (
    <div data-testid="sounds-mini-player" data-variant={variant} />
  ),
}));

const initCalendar = vi.fn();

function setup(
  companion: 'quote' | 'calendar' | 'both',
  calendarEnabled: boolean,
  settingsOverrides: Partial<Settings> = {}
) {
  vi.mocked(isCalendarFeatureEnabled).mockReturnValue(calendarEnabled);
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
      initialize: vi.fn(),
      settings: {
        ...defaultSettings,
        quoteChangeInterval: 0,
        // The background only renders under glass; these tests are about that layer.
        colorTheme: 'glass',
        focusModeImageCategory: 'nature',
        pomodoroMusicEnabled: false,
        pomodoroCompanion: companion,
        backgroundDim: 0,
        backgroundBlur: 0,
        ...settingsOverrides,
      },
      preview: null,
    })
  );
  vi.mocked(useQuoteStore).mockImplementation(
    createSelectorMock({ initialize: vi.fn(), refreshQuote: vi.fn() })
  );
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock({ initialize: initCalendar }));
  vi.mocked(useFocusModeStore).mockImplementation(createSelectorMock({ isActive: false }));
  // isLoaded true so the background effect runs instead of early-returning.
  vi.mocked(useBackgroundStore).mockImplementation(
    createSelectorMock({ customBackground: null, isLoaded: true })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PomodoroPage - companion selection', () => {
  it('shows the calendar companion and initializes calendar when enabled', () => {
    setup('calendar', true);

    render(<PomodoroPage />);

    expect(screen.getByTestId('calendar-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('quote-display')).not.toBeInTheDocument();
    expect(initCalendar).toHaveBeenCalled();
  });

  it('falls back to the quote companion and skips calendar init when the feature is disabled', () => {
    setup('calendar', false);

    render(<PomodoroPage />);

    expect(screen.getByTestId('quote-display')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
    expect(initCalendar).not.toHaveBeenCalled();
  });

  it('renders the lean strip and a category-less quote in "both" mode', () => {
    setup('both', true);

    render(<PomodoroPage />);

    expect(screen.getByTestId('calendar-strip')).toHaveAttribute('data-lean', 'true');
    expect(screen.getByTestId('quote-display')).toHaveAttribute('data-hide-category', 'true');
    expect(initCalendar).toHaveBeenCalled();
  });

  // 'both' is a distinct render branch (lean strip + category-less quote); make
  // sure the feature gate collapses it to a plain quote too, not just 'calendar'.
  it('falls back to the quote companion in "both" mode when the feature is disabled', () => {
    setup('both', false);

    render(<PomodoroPage />);

    expect(screen.getByTestId('quote-display')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
    expect(initCalendar).not.toHaveBeenCalled();
  });

  it('does not initialize calendar for the default quote companion', () => {
    setup('quote', true);

    render(<PomodoroPage />);

    expect(screen.getByTestId('quote-display')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
    expect(initCalendar).not.toHaveBeenCalled();
  });
});

// App paints the Glass photo app-wide (App.background.test.tsx covers it); this page must
// not resolve or render a second copy on any theme.
describe('PomodoroPage - background', () => {
  it.each([
    ...PLAIN_THEMES,
    'glass',
  ] as const)('renders no background layer of its own on the %s theme', (colorTheme) => {
    setup('quote', false, { colorTheme });

    render(<PomodoroPage />);

    expect(screen.queryByTestId('pomodoro-background')).not.toBeInTheDocument();
  });

  it.each([
    ...PLAIN_THEMES,
    'glass',
  ] as const)('resolves no image of its own on the %s theme', async (colorTheme) => {
    setup('quote', false, { colorTheme });

    render(<PomodoroPage />);

    await waitFor(() => expect(screen.queryByTestId('quote-display')).toBeInTheDocument());
    expect(vi.mocked(preloadImages)).not.toHaveBeenCalled();
  });
});

// The children are stubbed here, so these cover the wiring only — that each child is handed
// the variant the theme implies. Whether a child honours it is its own suite's job.
describe('PomodoroPage - chrome wiring', () => {
  it('hands the timer overlay chrome under the glass photo', () => {
    setup('quote', false, { colorTheme: 'glass' });

    render(<PomodoroPage />);

    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-variant', 'overlay');
  });

  it('hands the timer surface chrome when the theme shows no photo', () => {
    setup('quote', false, { colorTheme: 'purple' });

    render(<PomodoroPage />);

    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-variant', 'surface');
  });

  it('hands the calendar strip surface chrome when the theme shows no photo', () => {
    setup('calendar', true, { colorTheme: 'purple' });

    render(<PomodoroPage />);

    expect(screen.getByTestId('calendar-strip')).toHaveAttribute('data-variant', 'surface');
  });

  it('hands the music player surface chrome when the theme shows no photo', () => {
    setup('quote', false, { colorTheme: 'purple', pomodoroMusicEnabled: true });

    render(<PomodoroPage />);

    expect(screen.getByTestId('sounds-mini-player')).toHaveAttribute('data-variant', 'surface');
  });

  it('lets the header pick its own transparency instead of forcing it', () => {
    setup('quote', false, { colorTheme: 'purple' });

    render(<PomodoroPage />);

    expect(screen.getByTestId('page-header')).not.toHaveAttribute('data-transparent');
  });
});
