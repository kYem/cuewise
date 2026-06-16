import type { Settings } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory, taskWithDueDateFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCalendarStore } from '../stores/calendar-store';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { isCalendarFeatureEnabled } from '../utils/google-calendar';
import { GoalsSection } from './GoalsSection';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn(() => false) }));
vi.mock('@cuewise/storage', () => ({
  getStorageUsage: vi.fn(async () => ({ isWarning: false, isCritical: false })),
}));
// Stub the heavy children — this suite only exercises the section's ⚙ menu.
vi.mock('./GoalsList', () => ({ GoalsList: () => null }));
vi.mock('./GoalFocusView', () => ({ GoalFocusView: () => null }));
vi.mock('./StorageIndicator', () => ({ StorageIndicator: () => null }));
vi.mock('./CalendarStrip', () => ({ CalendarStrip: () => <div data-testid="calendar-strip" /> }));

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function mockStores(
  options: {
    goals?: ReturnType<typeof goalFactory.build>[];
    settings?: Partial<Settings>;
    calendarEnabled?: boolean;
  } = {}
) {
  const today = goalFactory.build({ text: 'Today task', completed: false });
  const goalState = {
    isLoading: false,
    error: null,
    todayTasks: [today],
    goals: options.goals ?? [today],
    initialize: vi.fn(),
  };
  const updateSettings = vi.fn();

  const initCalendar = vi.fn();
  vi.mocked(isCalendarFeatureEnabled).mockReturnValue(options.calendarEnabled ?? false);
  vi.mocked(useGoalStore).mockImplementation(createSelectorMock(goalState));
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock({ initialize: initCalendar }));
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ goalViewMode: 'full', ...options.settings, updateSettings })
  );

  return { updateSettings, initCalendar };
}

describe('GoalsSection - options menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches view mode via the menu', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores();

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: 'Compact' }));

    expect(updateSettings).toHaveBeenCalledWith({ goalViewMode: 'compact' });
  });

  it('toggles show-completed to the negated value', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores();

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Show completed' }));

    // default showCompletedGoals is true
    expect(updateSettings).toHaveBeenCalledWith({ showCompletedGoals: false });
  });

  it('hides the Show-incomplete and Upcoming entries when their counts are zero', async () => {
    const user = userEvent.setup();
    mockStores(); // goals = only today's task → no backlog, no upcoming

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));

    expect(screen.queryByRole('button', { name: /Show incomplete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upcoming/ })).not.toBeInTheDocument();
  });

  it('shows and toggles the Show-incomplete entry when there is recent backlog', async () => {
    const user = userEvent.setup();
    const backlog = goalFactory.build({ text: 'Old', completed: false, date: twoDaysAgo });
    const { updateSettings } = mockStores({ goals: [backlog] });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: /Show incomplete/ }));

    expect(updateSettings).toHaveBeenCalledWith({ showIncompleteGoals: true });
  });

  it('shows and toggles the Upcoming entry when there are due-soon tasks', async () => {
    const user = userEvent.setup();
    const upcoming = taskWithDueDateFactory.build({ text: 'Ship release' });
    const { updateSettings } = mockStores({ goals: [upcoming] });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: /Upcoming/ }));

    expect(updateSettings).toHaveBeenCalledWith({ showUpcomingGoals: true });
  });
});

describe('GoalsSection - calendar toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows goals only by default (calendar off)', () => {
    mockStores({ calendarEnabled: true });

    render(<GoalsSection />);

    expect(screen.getByText("Today's Focus")).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
  });

  it('shows the calendar alongside goals when toggled on', () => {
    mockStores({ settings: { newTabShowCalendar: true }, calendarEnabled: true });

    render(<GoalsSection />);

    expect(screen.getByText("Today's Focus")).toBeInTheDocument();
    expect(screen.getByTestId('calendar-strip')).toBeInTheDocument();
  });

  it('keeps the calendar hidden when the feature is disabled even if toggled on', () => {
    mockStores({ settings: { newTabShowCalendar: true }, calendarEnabled: false });

    render(<GoalsSection />);

    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
    expect(screen.getByText("Today's Focus")).toBeInTheDocument();
  });

  it('hides the Calendar toggle row when the feature is disabled', async () => {
    const user = userEvent.setup();
    mockStores({ calendarEnabled: false });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));

    expect(screen.queryByRole('switch', { name: 'Show calendar' })).not.toBeInTheDocument();
  });

  it('toggles the calendar on from the menu', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({ calendarEnabled: true });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('switch', { name: 'Show calendar' }));

    expect(updateSettings).toHaveBeenCalledWith({ newTabShowCalendar: true });
  });

  it('shows the position control only when the calendar is on', async () => {
    const user = userEvent.setup();
    mockStores({ settings: { newTabShowCalendar: false }, calendarEnabled: true });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));

    expect(
      screen.queryByRole('button', { name: /Calendar (above|below) goals/ })
    ).not.toBeInTheDocument();
  });

  it('flips the calendar position from the menu', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({
      settings: { newTabShowCalendar: true, newTabCalendarPosition: 'below' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: 'Calendar below goals' }));

    expect(updateSettings).toHaveBeenCalledWith({ newTabCalendarPosition: 'above' });
  });

  it('stacks the calendar above goals when position is above', () => {
    mockStores({
      settings: { newTabShowCalendar: true, newTabCalendarPosition: 'above' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);

    const calendar = screen.getByTestId('calendar-strip');
    const goals = screen.getByText("Today's Focus");
    // calendar precedes goals in document order
    expect(
      calendar.compareDocumentPosition(goals) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeGreaterThan(0);
  });

  it('stacks the calendar below goals when position is below', () => {
    mockStores({
      settings: { newTabShowCalendar: true, newTabCalendarPosition: 'below' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);

    const calendar = screen.getByTestId('calendar-strip');
    const goals = screen.getByText("Today's Focus");
    // goals precedes calendar in document order
    expect(
      goals.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeGreaterThan(0);
  });

  it('initializes the calendar store only when the calendar is shown', () => {
    const { initCalendar } = mockStores({
      settings: { newTabShowCalendar: true },
      calendarEnabled: true,
    });

    render(<GoalsSection />);

    expect(initCalendar).toHaveBeenCalled();
  });

  it('does not initialize the calendar store when the calendar is off', () => {
    const { initCalendar } = mockStores({
      settings: { newTabShowCalendar: false },
      calendarEnabled: true,
    });

    render(<GoalsSection />);

    expect(initCalendar).not.toHaveBeenCalled();
  });

  it('does not initialize the calendar store when the feature is disabled', () => {
    const { initCalendar } = mockStores({
      settings: { newTabShowCalendar: true },
      calendarEnabled: false,
    });

    render(<GoalsSection />);

    expect(initCalendar).not.toHaveBeenCalled();
  });
});
