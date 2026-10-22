import { goalFactory, taskWithSubtasksFactory } from '@cuewise/test-utils/factories';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderCompactRow } from './__fixtures__/compact-goal-row.fixtures';

describe('CompactGoalRow', () => {
  it('calls onToggleComplete when the flag/check pill is clicked', async () => {
    const user = userEvent.setup();
    const onToggleComplete = vi.fn();
    const goal = goalFactory.build({ text: 'Walk', completed: false });

    renderCompactRow({ goal, onToggleComplete });

    await user.click(screen.getByRole('button', { name: 'Mark as complete' }));
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the subtask progress count and expands via the chevron', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const goal = taskWithSubtasksFactory.build({ text: 'Plan trip' });

    renderCompactRow({ goal, onToggleExpand });

    expect(screen.getByText('0/2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('renders subtasks when expanded and toggles one by id', async () => {
    const user = userEvent.setup();
    const onToggleSubtask = vi.fn();
    const goal = taskWithSubtasksFactory.build({ text: 'Plan trip' });

    renderCompactRow({ goal, expanded: true, onToggleSubtask });

    await user.click(screen.getByRole('button', { name: 'Mark "Subtask 1" complete' }));
    expect(onToggleSubtask).toHaveBeenCalledWith('sub-1');
  });

  it('expands a goal without subtasks so one can be added', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const goal = goalFactory.build({ text: 'Walk', completed: false });

    renderCompactRow({ goal, onToggleExpand });

    expect(screen.queryByText('0/0')).not.toBeInTheDocument();
    await user.click(screen.getByText('Walk'));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('hides the add-subtask affordance while collapsed', () => {
    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }) });

    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument();
  });

  it('opens the add field from the expanded row', async () => {
    const user = userEvent.setup();
    const onStartAddingSubtask = vi.fn();

    renderCompactRow({
      goal: goalFactory.build({ text: 'Walk' }),
      expanded: true,
      onStartAddingSubtask,
    });

    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    expect(onStartAddingSubtask).toHaveBeenCalledTimes(1);
  });

  it('saves a typed subtask on Enter', async () => {
    const user = userEvent.setup();
    const onAddSubtask = vi.fn();
    const onStopAddingSubtask = vi.fn();
    const goal = goalFactory.build({ text: 'Walk' });

    renderCompactRow({
      goal,
      expanded: true,
      addingSubtask: true,
      onAddSubtask,
      onStopAddingSubtask,
    });

    await user.type(screen.getByLabelText('Add a subtask'), '  Stretch  {Enter}');
    expect(onAddSubtask).toHaveBeenCalledWith('Stretch');
    expect(onStopAddingSubtask).toHaveBeenCalled();
  });

  it('discards the draft on Escape', async () => {
    const user = userEvent.setup();
    const onAddSubtask = vi.fn();
    const onStopAddingSubtask = vi.fn();
    const goal = goalFactory.build({ text: 'Walk' });

    renderCompactRow({
      goal,
      expanded: true,
      addingSubtask: true,
      onAddSubtask,
      onStopAddingSubtask,
    });

    await user.type(screen.getByLabelText('Add a subtask'), 'Stretch{Escape}');
    expect(onStopAddingSubtask).toHaveBeenCalled();
    expect(onAddSubtask).not.toHaveBeenCalled();
  });
});
