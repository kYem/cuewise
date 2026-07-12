import { goalFactory, taskWithSubtasksFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompactGoalRow } from './CompactGoalRow';

const noop = () => {};

describe('CompactGoalRow', () => {
  it('calls onToggleComplete when the flag/check pill is clicked', async () => {
    const user = userEvent.setup();
    const onToggleComplete = vi.fn();
    const goal = goalFactory.build({ text: 'Walk', completed: false });

    render(
      <CompactGoalRow
        goal={goal}
        expanded={false}
        onToggleComplete={onToggleComplete}
        onToggleExpand={noop}
        onToggleSubtask={noop}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Mark as complete' }));
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the subtask progress count and expands via the chevron', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const goal = taskWithSubtasksFactory.build({ text: 'Plan trip' });

    render(
      <CompactGoalRow
        goal={goal}
        expanded={false}
        onToggleComplete={noop}
        onToggleExpand={onToggleExpand}
        onToggleSubtask={noop}
      />
    );

    expect(screen.getByText('0/2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('renders subtasks when expanded and toggles one by id', async () => {
    const user = userEvent.setup();
    const onToggleSubtask = vi.fn();
    const goal = taskWithSubtasksFactory.build({ text: 'Plan trip' });

    render(
      <CompactGoalRow
        goal={goal}
        expanded
        onToggleComplete={noop}
        onToggleExpand={noop}
        onToggleSubtask={onToggleSubtask}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Mark "Subtask 1" complete' }));
    expect(onToggleSubtask).toHaveBeenCalledWith('sub-1');
  });

  it('does not offer an expand affordance for a goal without subtasks', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const goal = goalFactory.build({ text: 'Walk', completed: false });

    render(
      <CompactGoalRow
        goal={goal}
        expanded={false}
        onToggleComplete={noop}
        onToggleExpand={onToggleExpand}
        onToggleSubtask={noop}
      />
    );

    expect(screen.queryByRole('button', { name: 'Show subtasks' })).not.toBeInTheDocument();
    await user.click(screen.getByText('Walk'));
    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});
