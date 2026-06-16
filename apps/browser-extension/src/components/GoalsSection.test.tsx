import type { Settings } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory, taskWithDueDateFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
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
vi.mock('./CalendarStrip', () => ({
  CalendarStrip: ({ headerAction }: { headerAction?: ReactNode }) => (
    <div data-testid="calendar-strip">{headerAction}</div>
  ),
}));

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

    expect(updateSettings).toHaveBeenCalledWith({
      goalViewMode: 'compact',
      newTabPrimary: 'goals',
    });
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

describe('GoalsSection - calendar primary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the calendar block when primary is calendar and the feature is enabled', () => {
    mockStores({ settings: { newTabPrimary: 'calendar' }, calendarEnabled: true });

    render(<GoalsSection />);

    expect(screen.getByTestId('calendar-strip')).toBeInTheDocument();
    expect(screen.queryByText("Today's Focus")).not.toBeInTheDocument();
  });

  it('falls back to goals when primary is calendar but the feature is disabled', () => {
    mockStores({ settings: { newTabPrimary: 'calendar' }, calendarEnabled: false });

    render(<GoalsSection />);

    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument();
    expect(screen.getByText("Today's Focus")).toBeInTheDocument();
  });

  it('stacks both blocks when primary is both', () => {
    mockStores({ settings: { newTabPrimary: 'both' }, calendarEnabled: true });

    render(<GoalsSection />);

    expect(screen.getByTestId('calendar-strip')).toBeInTheDocument();
    expect(screen.getByText("Today's Focus")).toBeInTheDocument();
  });

  it('hides the Calendar menu entry when the feature is disabled', async () => {
    const user = userEvent.setup();
    mockStores({ calendarEnabled: false });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));

    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument();
  });

  it('selects the calendar primary from the menu', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({ calendarEnabled: true });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: 'Calendar' }));

    expect(updateSettings).toHaveBeenCalledWith({ newTabPrimary: 'calendar' });
  });

  it('selects the both layout from the menu', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({ calendarEnabled: true });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: 'Both' }));

    expect(updateSettings).toHaveBeenCalledWith({ newTabPrimary: 'both' });
  });

  it('stacks the calendar above goals when position is above', () => {
    mockStores({
      settings: { newTabPrimary: 'both', newTabCalendarPosition: 'above' },
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
      settings: { newTabPrimary: 'both', newTabCalendarPosition: 'below' },
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

  it('changes the calendar position from the menu in both mode', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({
      settings: { newTabPrimary: 'both', newTabCalendarPosition: 'below' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: 'Above goals' }));

    expect(updateSettings).toHaveBeenCalledWith({ newTabCalendarPosition: 'above' });
  });

  it('hides the calendar-position control when not in both mode', async () => {
    const user = userEvent.setup();
    mockStores({ settings: { newTabPrimary: 'calendar' }, calendarEnabled: true });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));

    expect(screen.queryByText('Calendar position')).not.toBeInTheDocument();
  });

  it('lets the user switch back to goals from calendar-only mode', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({
      settings: { newTabPrimary: 'calendar' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);
    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(screen.getByRole('button', { name: 'Full' }));

    expect(updateSettings).toHaveBeenCalledWith({ goalViewMode: 'full', newTabPrimary: 'goals' });
  });

  it('initializes the calendar store when the calendar block is shown', () => {
    const { initCalendar } = mockStores({
      settings: { newTabPrimary: 'calendar' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);

    expect(initCalendar).toHaveBeenCalled();
  });

  it('does not initialize the calendar store for goals-only', () => {
    const { initCalendar } = mockStores({
      settings: { newTabPrimary: 'goals' },
      calendarEnabled: true,
    });

    render(<GoalsSection />);

    expect(initCalendar).not.toHaveBeenCalled();
  });

  it('does not initialize the calendar store when the feature is disabled', () => {
    const { initCalendar } = mockStores({
      settings: { newTabPrimary: 'calendar' },
      calendarEnabled: false,
    });

    render(<GoalsSection />);

    expect(initCalendar).not.toHaveBeenCalled();
  });
});
