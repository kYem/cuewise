import { getNextDayDateString } from '@cuewise/shared';
import { createSettingsStoreMock } from '@cuewise/test-utils';
import {
  completedGoalFactory,
  goalFactory,
  taskWithDueDateFactory,
  taskWithSubtasksFactory,
} from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { createGoalStoreMock, createMockGoalStore } from './__fixtures__/goals-list.fixtures';
import { setReducedMotion } from './__fixtures__/motion.fixtures';
import { CHECKBOX_TICK_MS } from './AnimatedCheckbox';
import { GoalFocusView } from './GoalFocusView';

vi.mock('../stores/goal-store', () => ({
  useGoalStore: vi.fn(),
}));

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

function mockSettings(focusedGoalId: string | null) {
  vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock({ focusedGoalId }));
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

describe('GoalFocusView - completing the focused task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setReducedMotion(false);
  });

  function setup(toggleResult: boolean) {
    const updateSettings = vi.fn();
    const current = goalFactory.build({ text: 'Current task', completed: false });
    const next = goalFactory.build({ text: 'Next task', completed: false });
    const store = createMockGoalStore({
      todayTasks: [current, next],
      goals: [current, next],
      toggleTask: vi.fn(async () => toggleResult),
    });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    vi.mocked(useSettingsStore).mockImplementation(
      createSettingsStoreMock({ focusedGoalId: current.id, updateSettings })
    );
    return { store, updateSettings, current, next };
  }

  it('holds the completed task and only advances after the tick delay', async () => {
    vi.useFakeTimers();
    const { store, updateSettings, current, next } = setup(true);

    render(<GoalFocusView />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Current task/ }));
    });

    expect(store.toggleTask).toHaveBeenCalledWith(current.id);
    expect(updateSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(CHECKBOX_TICK_MS);
    });

    expect(updateSettings).toHaveBeenCalledWith({ focusedGoalId: next.id });
    vi.useRealTimers();
  });

  it('advances immediately under reduced motion with no hold', async () => {
    setReducedMotion(true);
    const { updateSettings, next } = setup(true);

    render(<GoalFocusView />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Current task/ }));
    });

    expect(updateSettings).toHaveBeenCalledWith({ focusedGoalId: next.id });
  });

  it('does not advance or hold when the toggle fails to persist', async () => {
    const { store, updateSettings, current } = setup(false);

    render(<GoalFocusView />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Current task/ }));
    });

    expect(store.toggleTask).toHaveBeenCalledWith(current.id);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('ignores a second click while the tick is still playing', async () => {
    vi.useFakeTimers();
    const { store } = setup(true);

    render(<GoalFocusView />);
    const button = screen.getByRole('button', { name: /Current task/ });
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(store.toggleTask).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
