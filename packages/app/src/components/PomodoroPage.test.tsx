import { createSelectorMock } from '@cuewise/test-utils';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackgroundStore } from '../stores/background-store';
import { useCalendarStore } from '../stores/calendar-store';
import { useFocusModeStore } from '../stores/focus-mode-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { isCalendarFeatureEnabled } from '../utils/google-calendar';
import { preloadImages } from '../utils/image-preload-cache';
import { PomodoroPage } from './PomodoroPage';

vi.mock('../stores/quote-store', () => ({ useQuoteStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
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

function setup(companion: 'quote' | 'calendar' | 'both', calendarEnabled: boolean) {
  vi.mocked(isCalendarFeatureEnabled).mockReturnValue(calendarEnabled);
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
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

describe('background resolution', () => {
  it("resolves today's background before reading the cache", async () => {
    setup('quote', false);

    render(<PomodoroPage />);

    await waitFor(() => expect(vi.mocked(preloadImages)).toHaveBeenCalledWith('nature'));
  });

  it('waits for storage before resolving, so a curated photo cannot flash over a custom one', async () => {
    setup('quote', false);
    vi.mocked(useBackgroundStore).mockImplementation(
      createSelectorMock({ customBackground: null, isLoaded: false })
    );

    render(<PomodoroPage />);

    await waitFor(() => expect(screen.queryByTestId('quote-display')).toBeInTheDocument());
    expect(vi.mocked(preloadImages)).not.toHaveBeenCalled();
  });
});
