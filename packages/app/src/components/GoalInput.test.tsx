import { createSelectorMock } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { createMockGoalStore } from './__fixtures__/goals-list.fixtures';
import { GoalInput } from './GoalInput';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));

const ADD_INPUT = { name: 'Add a goal' };

describe('GoalInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGoalStore).mockImplementation(
      createSelectorMock({ ...createMockGoalStore(), addTask: vi.fn(async () => true) })
    );
  });

  it('leaves focus alone when it mounts with an earlier focus request', () => {
    render(<GoalInput variant="widget" focusRequest={2} />);

    expect(screen.getByRole('textbox', ADD_INPUT)).not.toHaveFocus();
  });

  it('takes focus when a new request arrives after mount', () => {
    const { rerender } = render(<GoalInput variant="widget" focusRequest={2} />);

    rerender(<GoalInput variant="widget" focusRequest={3} />);

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('calls onDismiss on Escape', () => {
    const onDismiss = vi.fn();
    render(<GoalInput variant="widget" onDismiss={onDismiss} />);

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
