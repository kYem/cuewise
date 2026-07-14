import { type InsightsData, QUOTE_CATEGORIES, type QuoteCategory } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useInsightsStore } from '../stores/insights-store';
import { useSettingsStore } from '../stores/settings-store';
import { InsightsPage } from './InsightsPage';

vi.mock('../stores/insights-store', () => ({ useInsightsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('./ConceptInsights', () => ({
  ConceptInsights: () => <div data-testid="concept-insights" />,
}));

function makeInsights(): InsightsData {
  return {
    totalQuotesViewed: 10,
    quotesViewedThisWeek: 3,
    goalsCompletedToday: 1,
    goalsCompletedThisWeek: 4,
    goalsCompletedThisMonth: 12,
    pomodorosCompletedToday: 2,
    focusTimeToday: 50,
    focusTimeThisWeek: 200,
    categoryViewCounts: Object.fromEntries(
      (Object.keys(QUOTE_CATEGORIES) as QuoteCategory[]).map((category) => [category, 1])
    ) as Record<QuoteCategory, number>,
    streak: { current: 3, longest: 7, lastActive: '2026-06-18' },
    activeGoals: 2,
    objectivesCompletedThisMonth: 1,
    avgGoalProgress: 60,
  };
}

interface SetupOptions {
  enabled?: boolean;
  cards?: ReturnType<typeof conceptCardFactory.build>[];
  postureSummary?: {
    todayPercent: number | null;
    sevenDayPercent: number | null;
    trackedHoursToday: number;
  } | null;
}

function setup({ enabled = true, cards = [], postureSummary = null }: SetupOptions = {}) {
  vi.mocked(useInsightsStore).mockReturnValue({
    insights: makeInsights(),
    analytics: null,
    postureSummary,
    isLoading: false,
    initialize: vi.fn(),
    exportAsJSON: vi.fn(),
    exportAsCSV: vi.fn(),
    exportAllAsJSON: vi.fn(),
    importValidation: null,
    isImporting: false,
    validateImportFile: vi.fn(),
    executeImport: vi.fn(),
    clearImportValidation: vi.fn(),
  } as unknown as ReturnType<typeof useInsightsStore>);
  vi.mocked(useConceptCardsStore).mockImplementation(
    createSelectorMock({ cards, initialize: vi.fn() })
  );
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({ settings: { conceptCardsEnabled: enabled } })
  );
}

function conceptsTab() {
  return screen.queryByRole('button', { name: 'Concepts' });
}

describe('InsightsPage — posture card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the upright card when posture data exists', () => {
    setup({ postureSummary: { todayPercent: 82, sevenDayPercent: 76, trackedHoursToday: 4.2 } });

    render(<InsightsPage />);

    expect(screen.getByText('Upright Today')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText(/7-day avg 76% \| 4.2h tracked/)).toBeInTheDocument();
  });

  it('renders a dash when today has no readings yet', () => {
    setup({ postureSummary: { todayPercent: null, sevenDayPercent: 76, trackedHoursToday: 0 } });

    render(<InsightsPage />);

    expect(screen.getByText('Upright Today')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('hides the card entirely without posture data (e.g. the extension)', () => {
    setup();

    render(<InsightsPage />);

    expect(screen.queryByText('Upright Today')).not.toBeInTheDocument();
  });
});

describe('InsightsPage — Concepts tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the Concepts tab when the feature is disabled', () => {
    setup({ enabled: false, cards: [conceptCardFactory.build()] });

    render(<InsightsPage />);

    expect(conceptsTab()).toBeNull();
  });

  it('hides the Concepts tab when there are no cards', () => {
    setup({ enabled: true, cards: [] });

    render(<InsightsPage />);

    expect(conceptsTab()).toBeNull();
  });

  it('shows the Concepts tab and renders ConceptInsights when enabled with cards', () => {
    setup({ enabled: true, cards: [conceptCardFactory.build()] });

    render(<InsightsPage />);
    const tab = conceptsTab();
    expect(tab).not.toBeNull();
    if (tab) {
      fireEvent.click(tab);
    }

    expect(screen.getByTestId('concept-insights')).toBeInTheDocument();
  });

  it('falls back to Overview if the tab loses its data while active', () => {
    setup({ enabled: true, cards: [conceptCardFactory.build()] });
    const { rerender } = render(<InsightsPage />);
    const tab = conceptsTab();
    if (tab) {
      fireEvent.click(tab);
    }
    expect(screen.getByTestId('concept-insights')).toBeInTheDocument();
    // Overview content is hidden while the Concepts tab is active.
    expect(screen.queryByText('Category Insights')).toBeNull();

    // Last card deleted -> showConcepts flips false while the Concepts tab is active.
    setup({ enabled: true, cards: [] });
    rerender(<InsightsPage />);

    expect(screen.queryByTestId('concept-insights')).toBeNull();
    expect(conceptsTab()).toBeNull();
    // The reset effect must have switched activeTab back to Overview — this fails
    // if that effect is removed (activeTab would stay 'concepts', Overview hidden).
    expect(screen.getByText('Category Insights')).toBeInTheDocument();
  });
});
