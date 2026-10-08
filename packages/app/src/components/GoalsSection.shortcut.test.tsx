import type { Settings } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveIds, renderWithShortcuts } from '../shortcuts/__fixtures__/shortcuts.fixtures';
import { ShortcutProvider } from '../shortcuts/ShortcutProvider';
import { useCalendarStore } from '../stores/calendar-store';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { createMockGoalStore } from './__fixtures__/goals-list.fixtures';
import { GoalInput } from './GoalInput';
import { GoalsSection } from './GoalsSection';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn(() => false) }));
vi.mock('@cuewise/storage', () => ({
  getStorageUsage: vi.fn(async () => ({ available: true, isWarning: false, isCritical: false })),
}));

// The focus view's input keeps its visible label; the widget and boxed inputs are named "Add a goal".
const ADD_INPUT = { name: /Add a goal|main goal for today/ };

function mockStores(
  settings: Partial<Settings>,
  tasks = [goalFactory.build({ completed: false })]
) {
  const store = {
    ...createMockGoalStore({ todayTasks: tasks, goals: tasks }),
    error: null,
    initialize: vi.fn(),
    addTask: vi.fn(async () => true),
  };
  vi.mocked(useGoalStore).mockImplementation(createSelectorMock(store));
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock({ initialize: vi.fn() }));
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ showCompletedGoals: false, ...settings })
  );
}

describe('GoalsSection - add-goal shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'full',
    'compact',
    'focus',
  ] as const)('n opens and focuses the add input in %s view with tasks on screen', (goalViewMode) => {
    mockStores({ goalViewMode });
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('n opens the add input once every task is done in focus view', () => {
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('keeps the n out of the input it opens', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveValue('');
  });

  it('leaves focus alone when an add input mounts after an earlier n', () => {
    mockStores({ goalViewMode: 'full' });
    render(<GoalInput variant="widget" focusRequest={2} />);

    expect(screen.getByRole('textbox', ADD_INPUT)).not.toHaveFocus();
  });

  it('focuses a mounted add input when n asks again', () => {
    mockStores({ goalViewMode: 'full' });
    const { rerender } = render(<GoalInput variant="widget" focusRequest={2} />);

    rerender(<GoalInput variant="widget" focusRequest={3} />);

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('Escape closes the add row n opened in compact view', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('switching view closes the add row n opened', () => {
    mockStores({ goalViewMode: 'compact' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    fireEvent.keyDown(document.body, { key: 'n' });

    mockStores({ goalViewMode: 'full' });
    rerender(
      <ShortcutProvider>
        <GoalsSection />
      </ShortcutProvider>
    );
    mockStores({ goalViewMode: 'compact' });
    rerender(
      <ShortcutProvider>
        <GoalsSection />
      </ShortcutProvider>
    );

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('offers the add-goal shortcut for Cuewise goals', () => {
    mockStores({ goalViewMode: 'full' });
    renderWithShortcuts(
      <>
        <GoalsSection />
        <LiveIds />
      </>
    );

    expect(screen.getByTestId('live')).toHaveTextContent('goal.add');
  });
});
