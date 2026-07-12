import { getNextDayDateString, getTodayDateString } from '@cuewise/shared';
import { taskWithDueDateFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { createGoalStoreMock, createMockGoalStore } from './__fixtures__/goals-list.fixtures';
import { UpcomingTasks } from './UpcomingTasks';

vi.mock('../stores/goal-store', () => ({
  useGoalStore: vi.fn(),
}));

// Returns an ISO yyyy-mm-dd string N days from today (N may be negative).
function daysFromToday(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

describe('UpcomingTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upcoming rows sorted by due date, soonest first', () => {
    const later = taskWithDueDateFactory.build({ text: 'Ship release', dueDate: daysFromToday(5) });
    const sooner = taskWithDueDateFactory.build({
      text: 'Pay invoice',
      dueDate: getNextDayDateString(),
    });
    // Pass them out of order to prove the component sorts.
    const store = createMockGoalStore({ goals: [later, sooner] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<UpcomingTasks defaultExpanded />);

    const rows = screen.getAllByText(/Pay invoice|Ship release/);
    expect(rows[0]).toHaveTextContent('Pay invoice');
    expect(rows[1]).toHaveTextContent('Ship release');
  });

  it('excludes completed tasks', () => {
    const task = taskWithDueDateFactory.build({ text: 'Done already', completed: true });
    const store = createMockGoalStore({ goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<UpcomingTasks defaultExpanded />);

    expect(screen.queryByText('Done already')).not.toBeInTheDocument();
  });

  it('excludes a task due today (only future due dates are "upcoming")', () => {
    const task = taskWithDueDateFactory.build({ text: 'Due today', dueDate: getTodayDateString() });
    const store = createMockGoalStore({ goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    const { container } = render(<UpcomingTasks defaultExpanded />);

    expect(screen.queryByText('Due today')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('returns nothing when there are no upcoming tasks', () => {
    const store = createMockGoalStore({ goals: [] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    const { container } = render(<UpcomingTasks defaultExpanded />);

    expect(container).toBeEmptyDOMElement();
  });

  it('includes a today-assigned task but hides its "Move to today" action', () => {
    const task = taskWithDueDateFactory.build({
      text: 'Write report',
      date: getTodayDateString(),
      dueDate: getNextDayDateString(),
    });
    const store = createMockGoalStore({ goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<UpcomingTasks defaultExpanded />);

    expect(screen.getByText('Write report')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to today' })).not.toBeInTheDocument();
  });

  it('shows "Move to today" for a task not assigned to today and calls moveTaskToToday', async () => {
    const user = userEvent.setup();
    const task = taskWithDueDateFactory.build({
      text: 'Old task',
      date: daysFromToday(-3),
      dueDate: daysFromToday(4),
    });
    const store = createMockGoalStore({ goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<UpcomingTasks defaultExpanded />);
    await user.click(screen.getByRole('button', { name: 'Move to today' }));

    expect(store.moveTaskToToday).toHaveBeenCalledWith(task.id);
  });

  it('toggles a task complete via its checkbox', async () => {
    const user = userEvent.setup();
    const task = taskWithDueDateFactory.build({ text: 'Ship release' });
    const store = createMockGoalStore({ goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<UpcomingTasks defaultExpanded />);
    await user.click(screen.getByRole('button', { name: 'Mark as complete' }));

    expect(store.toggleTask).toHaveBeenCalledWith(task.id);
  });

  it('starts collapsed and expands when the header is clicked', async () => {
    const user = userEvent.setup();
    const task = taskWithDueDateFactory.build({ text: 'Ship release' });
    const store = createMockGoalStore({ goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<UpcomingTasks defaultExpanded={false} />);

    expect(screen.queryByText('Ship release')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show upcoming tasks' }));
    expect(screen.getByText('Ship release')).toBeInTheDocument();
  });
});
