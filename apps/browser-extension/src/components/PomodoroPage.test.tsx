import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCalendarStore } from '../stores/calendar-store';
import { useFocusModeStore } from '../stores/focus-mode-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { isCalendarFeatureEnabled } from '../utils/google-calendar';
import { PomodoroPage } from './PomodoroPage';

vi.mock('../stores/quote-store', () => ({ useQuoteStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../stores/focus-mode-store', () => ({ useFocusModeStore: vi.fn() }));
vi.mock('../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn() }));
// Preloaded URL keeps the background effect synchronous (no async setState).
vi.mock('../utils/image-preload-cache', () => ({ getPreloadedCurrentUrl: () => 'preloaded.jpg' }));
vi.mock('../utils/unsplash', () => ({ loadImageWithFallback: () => Promise.resolve('img.jpg') }));

// Stub heavy children so the test isolates the companion-selection logic.
vi.mock('./CalendarStrip', () => ({
  CalendarStrip: ({ lean }: { lean?: boolean }) => (
    <div data-testid="calendar-strip" data-lean={lean ? 'true' : 'false'} />
  ),
}));
vi.mock('./QuoteDisplay', () => ({
  QuoteDisplay: ({ hideCategory }: { hideCategory?: boolean }) => (
    <div data-testid="quote-display" data-hide-category={hideCategory ? 'true' : 'false'} />
  ),
}));
vi.mock('./FocusMode', () => ({ FocusMode: () => null }));
vi.mock('./PomodoroTimer', () => ({ PomodoroTimer: () => null }));
vi.mock('./PageHeader', () => ({ PageHeader: () => null }));
vi.mock('./sounds', () => ({ SoundsMiniPlayer: () => null }));

const initCalendar = vi.fn();

function selectorMock<T extends object>(store: T) {
  // biome-ignore lint/suspicious/noExplicitAny: selector operates on the mock store shape
  return (selector?: (state: any) => unknown) => (selector ? selector(store) : store);
}

function setup(companion: 'quote' | 'calendar' | 'both', calendarEnabled: boolean) {
  vi.mocked(isCalendarFeatureEnabled).mockReturnValue(calendarEnabled);
  vi.mocked(useSettingsStore).mockImplementation(
    selectorMock({
      initialize: vi.fn(),
      settings: {
        quoteChangeInterval: 0,
        focusModeImageCategory: 'nature',
        pomodoroMusicEnabled: false,
        pomodoroCompanion: companion,
      },
    })
  );
  vi.mocked(useQuoteStore).mockImplementation(
    selectorMock({ initialize: vi.fn(), refreshQuote: vi.fn() })
  );
  vi.mocked(useCalendarStore).mockImplementation(selectorMock({ initialize: initCalendar }));
  vi.mocked(useFocusModeStore).mockImplementation(selectorMock({ isActive: false }));
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

  it('does not initialize calendar for the default quote companion', () => {
    setup('quote', true);

    render(<PomodoroPage />);

    expect(screen.getByTestId('quote-display')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
    expect(initCalendar).not.toHaveBeenCalled();
  });
});
