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

  it('expands a goal without subtasks from its text', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const goal = goalFactory.build({ text: 'Walk', completed: false });

    renderCompactRow({ goal, onToggleExpand });

    const text = screen.getByRole('button', { name: 'Walk' });
    expect(text).toHaveAttribute('aria-expanded', 'false');
    await user.click(text);
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('marks the goal text as expanded while the panel is open', () => {
    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }), expanded: true });

    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('names the chevron for details when there are no subtasks to show', () => {
    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }), expanded: true });

    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument();
  });

  it('hides the add-subtask affordance while collapsed', () => {
    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }) });

    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument();
  });

  it('opens a focused add field from the expanded row', async () => {
    const user = userEvent.setup();

    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }), expanded: true });

    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    expect(screen.getByLabelText('Add a subtask')).toHaveFocus();
  });

  it('saves a typed subtask once on Enter and closes the field', async () => {
    const user = userEvent.setup();
    const onAddSubtask = vi.fn();

    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }), expanded: true, onAddSubtask });

    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.type(screen.getByLabelText('Add a subtask'), '  Stretch  {Enter}');
    expect(onAddSubtask).toHaveBeenCalledTimes(1);
    expect(onAddSubtask).toHaveBeenCalledWith('Stretch');
    expect(screen.queryByLabelText('Add a subtask')).not.toBeInTheDocument();
  });

  it('discards the draft on Escape', async () => {
    const user = userEvent.setup();
    const onAddSubtask = vi.fn();

    renderCompactRow({ goal: goalFactory.build({ text: 'Walk' }), expanded: true, onAddSubtask });

    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.type(screen.getByLabelText('Add a subtask'), 'Stretch{Escape}');
    expect(screen.queryByLabelText('Add a subtask')).not.toBeInTheDocument();
    expect(onAddSubtask).not.toHaveBeenCalled();
  });
});
