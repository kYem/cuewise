import { goalFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../../stores/goal-store';
import { createGoalStoreMock, createMockGoalStore } from '../__fixtures__/goals-list.fixtures';
import { FocusModeGoal } from './FocusModeGoal';

vi.mock('../../stores/goal-store', () => ({
  useGoalStore: vi.fn(),
}));

function renderWithTasks(tasks: ReturnType<typeof goalFactory.build>[]) {
  const store = createMockGoalStore({ todayTasks: tasks });
  vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
  render(<FocusModeGoal />);
  return store;
}

describe('FocusModeGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the next incomplete task with its position', () => {
    renderWithTasks([
      goalFactory.build({ text: 'Ship it', completed: true }),
      goalFactory.build({ text: 'Write report', completed: false }),
      goalFactory.build({ text: 'Reply to Sam', completed: false }),
    ]);

    expect(screen.getByText('Write report')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('completes the current task from the circle', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = renderWithTasks([task]);

    await user.click(screen.getByRole('button', { name: 'Mark "Write report" complete' }));

    expect(store.toggleTask).toHaveBeenCalledWith(task.id);
  });

  it('renders nothing when there are no tasks', () => {
    renderWithTasks([]);

    expect(screen.queryByText('Focusing on')).not.toBeInTheDocument();
  });

  it('renders nothing once everything is done', () => {
    renderWithTasks([goalFactory.build({ text: 'Ship it', completed: true })]);

    expect(screen.queryByText('Focusing on')).not.toBeInTheDocument();
  });
});
