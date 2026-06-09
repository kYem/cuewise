import { getNextDayDateString } from '@cuewise/shared';
import {
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
