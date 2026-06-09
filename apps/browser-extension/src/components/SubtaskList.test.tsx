import { goalFactory, taskWithSubtasksFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SubtaskList } from './SubtaskList';

function noopHandlers() {
  return { onAdd: vi.fn(), onToggle: vi.fn(), onRemove: vi.fn() };
}

describe('SubtaskList', () => {
  it('shows a progress count when the task has subtasks', () => {
    // taskWithSubtasksFactory has 2 incomplete subtasks
    const goal = taskWithSubtasksFactory.build();
    render(<SubtaskList goal={goal} {...noopHandlers()} />);

    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('expands to reveal subtask rows when the progress toggle is clicked', async () => {
    const user = userEvent.setup();
    const goal = taskWithSubtasksFactory.build();
    render(<SubtaskList goal={goal} {...noopHandlers()} />);

    expect(screen.queryByText('Subtask 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));

    expect(screen.getByText('Subtask 1')).toBeInTheDocument();
    expect(screen.getByText('Subtask 2')).toBeInTheDocument();
  });

  it('calls onToggle with the subtask id when a subtask checkbox is clicked', async () => {
    const user = userEvent.setup();
    const goal = taskWithSubtasksFactory.build();
    const handlers = noopHandlers();
    render(<SubtaskList goal={goal} {...handlers} />);

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.click(screen.getByRole('button', { name: 'Mark "Subtask 1" complete' }));

    expect(handlers.onToggle).toHaveBeenCalledWith('sub-1');
  });

  it('calls onRemove with the subtask id when the remove button is clicked', async () => {
    const user = userEvent.setup();
    const goal = taskWithSubtasksFactory.build();
    const handlers = noopHandlers();
    render(<SubtaskList goal={goal} {...handlers} />);

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.click(screen.getByRole('button', { name: 'Remove "Subtask 1"' }));

    expect(handlers.onRemove).toHaveBeenCalledWith('sub-1');
  });

  it('calls onAdd with the entered text when a new subtask is submitted', async () => {
    const user = userEvent.setup();
    const goal = taskWithSubtasksFactory.build();
    const handlers = noopHandlers();
    render(<SubtaskList goal={goal} {...handlers} />);

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.type(screen.getByLabelText('Add a subtask'), 'Draft outline{Enter}');

    expect(handlers.onAdd).toHaveBeenCalledWith('Draft outline');
  });

  it('clears the input after a subtask is added', async () => {
    const user = userEvent.setup();
    const goal = taskWithSubtasksFactory.build();
    render(<SubtaskList goal={goal} {...noopHandlers()} />);

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    const input = screen.getByLabelText('Add a subtask');
    await user.type(input, 'Draft outline{Enter}');

    expect(input).toHaveValue('');
  });

  it('ignores an empty or whitespace-only subtask submit', async () => {
    const user = userEvent.setup();
    const goal = taskWithSubtasksFactory.build();
    const handlers = noopHandlers();
    render(<SubtaskList goal={goal} {...handlers} />);

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.type(screen.getByLabelText('Add a subtask'), '   {Enter}');

    expect(handlers.onAdd).not.toHaveBeenCalled();
  });

  it('offers an "Add subtask" toggle when the task has no subtasks', async () => {
    const user = userEvent.setup();
    const goal = goalFactory.build(); // no subtasks
    render(<SubtaskList goal={goal} {...noopHandlers()} />);

    const addToggle = screen.getByRole('button', { name: 'Add subtask' });
    expect(addToggle).toBeInTheDocument();

    await user.click(addToggle);
    expect(screen.getByLabelText('Add a subtask')).toBeInTheDocument();
  });
});
