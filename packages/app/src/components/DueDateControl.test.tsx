import { getNextDayDateString } from '@cuewise/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DueDateControl } from './DueDateControl';

describe('DueDateControl', () => {
  it('labels the trigger "Set due date" when no due date is set', () => {
    render(<DueDateControl onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Set due date' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change due date' })).not.toBeInTheDocument();
  });

  it('labels the trigger "Change due date" when a due date is set', () => {
    render(<DueDateControl dueDate={getNextDayDateString()} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Change due date' })).toBeInTheDocument();
  });

  it('reveals a date input on trigger click and calls onSelect with the chosen date', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DueDateControl onSelect={onSelect} />);

    expect(screen.queryByLabelText('Due date')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Set due date' }));

    const input = screen.getByLabelText('Due date');
    fireEvent.change(input, { target: { value: '2026-06-20' } });

    expect(onSelect).toHaveBeenCalledWith('2026-06-20');
  });

  it('shows a clear button only when a due date is set and calls onSelect(null) when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DueDateControl dueDate={getNextDayDateString()} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Change due date' }));

    const clearButton = screen.getByRole('button', { name: 'Clear due date' });
    await user.click(clearButton);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('does not show a clear button when no due date is set', async () => {
    const user = userEvent.setup();
    render(<DueDateControl onSelect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Set due date' }));

    expect(screen.queryByRole('button', { name: 'Clear due date' })).not.toBeInTheDocument();
  });
});
