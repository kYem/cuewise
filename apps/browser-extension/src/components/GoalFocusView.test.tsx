import { getNextDayDateString } from '@cuewise/shared';
import {
  completedGoalFactory,
  goalFactory,
  taskWithDueDateFactory,
  taskWithSubtasksFactory,
} from '@cuewise/test-utils/factories';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { createGoalStoreMock, createMockGoalStore } from './__fixtures__/goals-list.fixtures';
import { GoalFocusView } from './GoalFocusView';

vi.mock('../stores/goal-store', () => ({
  useGoalStore: vi.fn(),
}));

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

function mockSettings(focusedGoalId: string | null) {
  vi.mocked(useSettingsStore).mockImplementation(() => ({
    settings: { ...defaultSettings, focusedGoalId },
    updateSettings: vi.fn(),
  }));
}

describe('GoalFocusView - task metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the due-date label for the focused task', () => {
    const task = taskWithDueDateFactory.build({
      text: 'Ship release',
      dueDate: getNextDayDateString(),
    });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    mockSettings(task.id);

    render(<GoalFocusView />);

    expect(screen.getByText('Ship release')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('shows subtask progress for the focused task', () => {
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    mockSettings(task.id);

    render(<GoalFocusView />);

    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('shows no due-date or subtask meta when the task has neither', () => {
    const task = goalFactory.build({ text: 'Bare task' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    mockSettings(task.id);

    render(<GoalFocusView />);

    expect(screen.getByText('Bare task')).toBeInTheDocument();
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });
});

describe('GoalFocusView - completed focused task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the All done screen when every task is complete, even if a completed task is still focused', () => {
    // Focused task was completed from another view, so focusedGoalId still points at it.
    const done = completedGoalFactory.build({ text: 'Finished it' });
    const store = createMockGoalStore({ todayTasks: [done], goals: [done] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    mockSettings(done.id);

    render(<GoalFocusView />);

    expect(screen.getByText('All done!')).toBeInTheDocument();
    expect(screen.queryByText('Finished it')).not.toBeInTheDocument();
  });

  it('skips a completed focused task and advances to the next incomplete one', () => {
    const done = completedGoalFactory.build({ text: 'Already done' });
    const next = goalFactory.build({ text: 'Do this next' });
    const store = createMockGoalStore({ todayTasks: [done, next], goals: [done, next] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    mockSettings(done.id);

    render(<GoalFocusView />);

    expect(screen.getByText('Do this next')).toBeInTheDocument();
    expect(screen.queryByText('Already done')).not.toBeInTheDocument();
  });
});
