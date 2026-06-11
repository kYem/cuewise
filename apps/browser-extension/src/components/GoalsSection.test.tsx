import { goalFactory, taskWithDueDateFactory } from '@cuewise/test-utils/factories';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { GoalsSection } from './GoalsSection';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('@cuewise/storage', () => ({
  getStorageUsage: vi.fn(async () => ({ isWarning: false, isCritical: false })),
}));
// Stub the heavy children — this suite only exercises the section's ⚙ menu.
vi.mock('./GoalsList', () => ({ GoalsList: () => null }));
vi.mock('./GoalFocusView', () => ({ GoalFocusView: () => null }));
vi.mock('./StorageIndicator', () => ({ StorageIndicator: () => null }));

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function mockStores(options: { goals?: ReturnType<typeof goalFactory.build>[] } = {}) {
  const today = goalFactory.build({ text: 'Today task', completed: false });
  const goalState = {
    isLoading: false,
    error: null,
    todayTasks: [today],
    goals: options.goals ?? [today],
    initialize: vi.fn(),
  };
  const updateSettings = vi.fn();
  const settingsState = { settings: { ...defaultSettings, goalViewMode: 'full' }, updateSettings };

  // biome-ignore lint/suspicious/noExplicitAny: selector accepts the store state
  vi.mocked(useGoalStore).mockImplementation((selector?: (s: any) => unknown) =>
    selector ? selector(goalState) : goalState
  );
  // biome-ignore lint/suspicious/noExplicitAny: selector accepts the store state
  vi.mocked(useSettingsStore).mockImplementation((selector?: (s: any) => unknown) =>
    selector ? selector(settingsState) : settingsState
  );

  return { updateSettings };
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
