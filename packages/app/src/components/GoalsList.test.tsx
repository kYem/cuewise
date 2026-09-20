import {
  getDateStringDaysAgo,
  getNextDayDateString,
  getTodayDateString,
  getYesterdayDateString,
} from '@cuewise/shared';
import {
  completedGoalFactory,
  goalFactory,
  taskWithDueDateFactory,
  taskWithSubtasksFactory,
} from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import {
  buildUnfinishedTasks,
  buildUnfinishedTasksOn,
  createGoalStoreMock,
  createMockGoalStore,
  createNoTodayTasksStore,
  createSettingsStoreMock,
  type MockGoalStore,
} from './__fixtures__/goals-list.fixtures';
import { GoalsList } from './GoalsList';

vi.mock('../stores/goal-store', () => ({
  useGoalStore: vi.fn(),
}));

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

describe('GoalsList - Duplicate task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('shows a duplicate button while editing a task and calls duplicateTask on click', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    // Enter edit mode by clicking the task text
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    const duplicateButton = screen.getByRole('button', { name: 'Duplicate task' });
    await user.click(duplicateButton);

    expect(store.duplicateTask).toHaveBeenCalledWith(task.id);
  });

  it('does not show a duplicate button when the task is not being edited', () => {
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.queryByRole('button', { name: 'Duplicate task' })).not.toBeInTheDocument();
  });
});

describe('GoalsList - Due dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('shows a due-date badge with the human label when a task has a dueDate', () => {
    // taskWithDueDateFactory defaults dueDate to tomorrow -> label "Tomorrow"
    const task = taskWithDueDateFactory.build({ text: 'Ship release' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    // A future due date is not styled as overdue
    expect(screen.getByTitle(`Due ${getNextDayDateString()}`)).not.toHaveClass('text-red-600');
  });

  it('styles the due-date badge red for an overdue task', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const task = taskWithDueDateFactory.build({ text: 'Overdue task', dueDate: yesterday });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.getByTitle(`Due ${yesterday}`)).toHaveClass('text-red-600');
  });

  it('exposes the due-date control while editing a task', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    expect(screen.getByRole('button', { name: 'Set due date' })).toBeInTheDocument();
  });

  it('calls setTaskDueDate with the task id and chosen date when a date is picked', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Write report' }));
    await user.click(screen.getByRole('button', { name: 'Set due date' }));

    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-06-20' } });

    expect(store.setTaskDueDate).toHaveBeenCalledWith(task.id, '2026-06-20');
  });
});

describe('GoalsList - Subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('renders subtask progress for a task that has subtasks', () => {
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('renders subtask progress in compact view as well', () => {
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList viewMode="compact" />);

    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('calls toggleSubtask with the task id and subtask id', async () => {
    const user = userEvent.setup();
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.click(screen.getByRole('button', { name: 'Mark "Subtask 1" complete' }));

    expect(store.toggleSubtask).toHaveBeenCalledWith(task.id, 'sub-1');
  });

  it('offers the add-subtask affordance when editing a task without subtasks', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    expect(screen.getByRole('button', { name: 'Add subtask' })).toBeInTheDocument();
  });

  // Regression: clicking "Add subtask" blurs the inline-edit input. The subtask
  // UI must survive that blur so the first subtask can actually be created.
  it('adds a first subtask to a task that has none, after the edit input blurs', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Write report' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    const input = screen.getByLabelText('Add a subtask');
    await user.type(input, 'Outline sections{Enter}');

    expect(store.addSubtask).toHaveBeenCalledWith(task.id, 'Outline sections');
  });

  // The add field commits on blur too (not only Enter), and must survive the
  // edit-input blur to do so.
  it('commits a subtask on blur of the add field', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Write report' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    await user.type(screen.getByLabelText('Add a subtask'), 'Outline sections');
    await user.tab(); // blur the field

    expect(store.addSubtask).toHaveBeenCalledWith(task.id, 'Outline sections');
  });

  it('ignores an empty or whitespace-only subtask submit', async () => {
    const user = userEvent.setup();
    const task = goalFactory.build({ text: 'Write report', completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Write report' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    await user.type(screen.getByLabelText('Add a subtask'), '   {Enter}');

    expect(store.addSubtask).not.toHaveBeenCalled();
  });

  it('removes a subtask via the remove control while editing', async () => {
    const user = userEvent.setup();
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Plan trip' }));
    await user.click(screen.getByRole('button', { name: 'Remove "Subtask 1"' }));

    expect(store.removeSubtask).toHaveBeenCalledWith(task.id, 'sub-1');
  });

  // Single-open accordion: expanding one row's subtasks collapses any other.
  it('keeps only one subtask accordion open at a time', async () => {
    const user = userEvent.setup();
    const taskA = goalFactory.build({
      text: 'Task A',
      subtasks: [{ id: 'a1', text: 'Alpha sub', completed: false }],
    });
    const taskB = goalFactory.build({
      text: 'Task B',
      subtasks: [{ id: 'b1', text: 'Beta sub', completed: false }],
    });
    const store = createMockGoalStore({ todayTasks: [taskA, taskB], goals: [taskA, taskB] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    // Expand A
    await user.click(screen.getAllByRole('button', { name: 'Show subtasks' })[0]);
    expect(screen.getByText('Alpha sub')).toBeInTheDocument();

    // Expand B — A's chevron is now "Hide subtasks", so the only "Show subtasks" is B
    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    expect(screen.getByText('Beta sub')).toBeInTheDocument();
    expect(screen.queryByText('Alpha sub')).not.toBeInTheDocument();
  });

  // Regression: expanding subtasks then opening the add-field used to render the
  // read-only list and the editable list at once, showing every subtask twice.
  it('does not duplicate existing subtasks while the add-field is open', async () => {
    const user = userEvent.setup();
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.click(screen.getByRole('button', { name: 'Plan trip' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    expect(screen.getByLabelText('Add a subtask')).toBeInTheDocument();
    expect(screen.getAllByText('Subtask 1')).toHaveLength(1);
  });

  // Bookend to the above: committing the new subtask must close the add-field and
  // leave the existing subtasks rendered once (read-only list returns, no overlap).
  it('shows existing subtasks exactly once after committing a new one', async () => {
    const user = userEvent.setup();
    const task = taskWithSubtasksFactory.build({ text: 'Plan trip' });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Show subtasks' }));
    await user.click(screen.getByRole('button', { name: 'Plan trip' }));
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.type(screen.getByLabelText('Add a subtask'), 'Book flights{Enter}');

    expect(store.addSubtask).toHaveBeenCalledWith(task.id, 'Book flights');
    expect(screen.queryByLabelText('Add a subtask')).not.toBeInTheDocument();
    expect(screen.getAllByText('Subtask 1')).toHaveLength(1);
  });
});

describe('GoalsList - Reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('shows a drag handle only for the task being edited', async () => {
    const user = userEvent.setup();
    const taskA = goalFactory.build({ text: 'First task' });
    const taskB = goalFactory.build({ text: 'Second task' });
    const store = createMockGoalStore({
      todayTasks: [taskA, taskB],
      goals: [taskA, taskB],
    });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    // No handle while resting
    expect(screen.queryByRole('button', { name: 'Drag to reorder' })).not.toBeInTheDocument();

    // Editing a task reveals its handle
    await user.click(screen.getByRole('button', { name: 'First task' }));
    expect(screen.getAllByRole('button', { name: 'Drag to reorder' })).toHaveLength(1);
  });
});

describe('GoalsList - Upcoming section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('renders upcoming tasks when showUpcomingGoals is enabled', () => {
    vi.mocked(useSettingsStore).mockImplementation(
      createSettingsStoreMock({ showUpcomingGoals: true })
    );
    const upcoming = taskWithDueDateFactory.build({ text: 'Ship release' });
    const store = createMockGoalStore({ todayTasks: [], goals: [upcoming] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.getByText('Ship release')).toBeInTheDocument();
  });

  it('hides upcoming tasks when showUpcomingGoals is off (default)', () => {
    const upcoming = taskWithDueDateFactory.build({ text: 'Ship release' });
    const store = createMockGoalStore({ todayTasks: [], goals: [upcoming] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.queryByText('Ship release')).not.toBeInTheDocument();
  });
});

describe('GoalsList - Unfinished group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('shows unfinished tasks from previous days by default', () => {
    const [stale] = buildUnfinishedTasks(1);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore([stale]))
    );

    render(<GoalsList />);

    expect(screen.getByText('Unfinished (1)')).toBeInTheDocument();
    expect(screen.getByText(stale.text)).toBeInTheDocument();
  });

  it('hides the group when showIncompleteGoals is turned off', () => {
    vi.mocked(useSettingsStore).mockImplementation(
      createSettingsStoreMock({ showIncompleteGoals: false })
    );
    const [stale] = buildUnfinishedTasks(1);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore([stale]))
    );

    render(<GoalsList />);

    expect(screen.queryByText('Unfinished (1)')).not.toBeInTheDocument();
    expect(screen.queryByText(stale.text)).not.toBeInTheDocument();
  });

  it('labels each row with its relative date', () => {
    const [stale] = buildUnfinishedTasks(1);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore([stale]))
    );

    render(<GoalsList />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('moves every unfinished task to today with one click', async () => {
    const user = userEvent.setup();
    const unfinished = buildUnfinishedTasks(3);
    const store = createNoTodayTasksStore(unfinished);
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Move all to today' }));

    expect(store.moveTasksToToday).toHaveBeenCalledWith(unfinished.map((task) => task.id));
  });

  it('moves a single row to today', async () => {
    const user = userEvent.setup();
    const [stale] = buildUnfinishedTasks(1);
    const store = createNoTodayTasksStore([stale]);
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: `Move "${stale.text}" to today` }));

    expect(store.moveTaskToToday).toHaveBeenCalledWith(stale.id);
  });

  it('deletes a single row', async () => {
    const user = userEvent.setup();
    const [stale] = buildUnfinishedTasks(1);
    const store = createNoTodayTasksStore([stale]);
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: `Delete "${stale.text}"` }));

    expect(store.deleteTask).toHaveBeenCalledWith(stale.id);
  });

  it('completes a single row', async () => {
    const user = userEvent.setup();
    const [stale] = buildUnfinishedTasks(1);
    const store = createNoTodayTasksStore([stale]);
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: `Mark "${stale.text}" complete` }));

    expect(store.toggleTask).toHaveBeenCalledWith(stale.id);
  });

  it("renders beneath today's tasks, counting only previous days", () => {
    const today = goalFactory.build({ text: 'Today thing', date: getTodayDateString() });
    const [stale] = buildUnfinishedTasks(1);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createMockGoalStore({ todayTasks: [today], goals: [today, stale] }))
    );

    render(<GoalsList />);

    const todayRow = screen.getByRole('button', { name: 'Today thing' });
    const header = screen.getByText('Unfinished (1)');
    expect(screen.getByText(stale.text)).toBeInTheDocument();
    expect(todayRow.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('lists the most recent day first and moves all in that order', async () => {
    const user = userEvent.setup();
    const [older, newer] = buildUnfinishedTasksOn([
      getDateStringDaysAgo(3),
      getYesterdayDateString(),
    ]);
    const store = createNoTodayTasksStore([older, newer]);
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    const rows = screen.getAllByText(/^Test goal/).map((node) => node.textContent);
    await user.click(screen.getByRole('button', { name: 'Move all to today' }));

    expect(rows).toEqual([newer.text, older.text]);
    expect(store.moveTasksToToday).toHaveBeenCalledWith([newer.id, older.id]);
  });

  it('moves only the tasks the group shows when goals are mixed', async () => {
    const user = userEvent.setup();
    const [stale] = buildUnfinishedTasks(1);
    const doneYesterday = completedGoalFactory.build({ date: getYesterdayDateString() });
    const tomorrow = goalFactory.build({ date: getNextDayDateString(), completed: false });
    const ancient = goalFactory.build({ date: getDateStringDaysAgo(20), completed: false });
    const store = createNoTodayTasksStore([doneYesterday, tomorrow, ancient, stale]);
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Move all to today' }));

    expect(screen.getByText('Unfinished (1)')).toBeInTheDocument();
    expect(store.moveTasksToToday).toHaveBeenCalledWith([stale.id]);
  });

  it('links to the goals page while expanded', () => {
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(buildUnfinishedTasks(1)))
    );

    render(<GoalsList />);

    expect(screen.getByRole('link', { name: /View all goals/ })).toHaveAttribute('href', '#goals');
  });

  it('collapses an expanded group when its header is clicked', async () => {
    const user = userEvent.setup();
    const unfinished = buildUnfinishedTasks(2);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(unfinished))
    );

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Unfinished (2)' }));

    expect(screen.getByRole('button', { name: 'Unfinished (2)' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText(unfinished[0].text)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View all goals/ })).not.toBeInTheDocument();
  });

  it('uses borderless rows in compact view, keeping every row action', () => {
    const [stale] = buildUnfinishedTasks(1);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore([stale]))
    );

    render(<GoalsList viewMode="compact" />);

    const row = screen.getByRole('button', { name: `Mark "${stale.text}" complete` }).parentElement;
    expect(row).not.toHaveClass('border');
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Move "${stale.text}" to today` })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete "${stale.text}"` })).toBeInTheDocument();
  });

  it('uses bordered card rows in full view', () => {
    const [stale] = buildUnfinishedTasks(1);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore([stale]))
    );

    render(<GoalsList />);

    const row = screen.getByRole('button', { name: `Mark "${stale.text}" complete` }).parentElement;
    expect(row).toHaveClass('border');
  });

  it('starts collapsed to the count when more than five are unfinished', () => {
    const unfinished = buildUnfinishedTasks(6);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(unfinished))
    );

    render(<GoalsList />);

    expect(screen.getByRole('button', { name: 'Unfinished (6)' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText(unfinished[0].text)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move all to today' })).toBeInTheDocument();
  });

  it('expands a collapsed group when its header is clicked', async () => {
    const user = userEvent.setup();
    const unfinished = buildUnfinishedTasks(6);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(unfinished))
    );

    render(<GoalsList />);
    await user.click(screen.getByRole('button', { name: 'Unfinished (6)' }));

    expect(screen.getByText(unfinished[0].text)).toBeInTheDocument();
  });

  it('starts expanded when five or fewer are unfinished', () => {
    const unfinished = buildUnfinishedTasks(5);
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(unfinished))
    );

    render(<GoalsList />);

    expect(screen.getByRole('button', { name: 'Unfinished (5)' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('points the empty state at the unfinished group', () => {
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(buildUnfinishedTasks(1)))
    );

    render(<GoalsList />);

    expect(screen.getByText('Unfinished tasks are below')).toBeInTheDocument();
  });

  it('does not promise an unfinished group when the only other task is tomorrow', () => {
    const deferred = goalFactory.build({ date: getNextDayDateString(), completed: false });
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore([deferred]))
    );

    render(<GoalsList />);

    expect(screen.queryByText('Unfinished tasks are below')).not.toBeInTheDocument();
  });

  it('does not promise an unfinished group when showIncompleteGoals is off', () => {
    vi.mocked(useSettingsStore).mockImplementation(
      createSettingsStoreMock({ showIncompleteGoals: false })
    );
    vi.mocked(useGoalStore).mockImplementation(
      createGoalStoreMock(createNoTodayTasksStore(buildUnfinishedTasks(1)))
    );

    render(<GoalsList />);

    expect(screen.queryByText('Unfinished tasks are below')).not.toBeInTheDocument();
  });
});

describe('GoalsList - Unfinished group across midnight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 12, 0, 0));
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Day rollover refreshes todayTasks but leaves the goals array reference untouched.
  it("surfaces yesterday's leftover after the day changes without a goals write", () => {
    const task = goalFactory.build({ date: getTodayDateString(), completed: false });
    const goals = [task];
    const store = createMockGoalStore({ todayTasks: [task], goals });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    const { rerender } = render(<GoalsList />);
    expect(screen.queryByText('Unfinished (1)')).not.toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 8, 21, 12, 0, 0));
    store.todayTasks = [];
    rerender(<GoalsList />);

    expect(screen.getByText('Unfinished (1)')).toBeInTheDocument();
  });

  it('updates the empty-state hint after the day changes without a goals write', () => {
    const task = goalFactory.build({ date: getTodayDateString(), completed: false });
    const store = createMockGoalStore({ todayTasks: [task], goals: [task] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    const { rerender } = render(<GoalsList />);

    vi.setSystemTime(new Date(2026, 8, 21, 12, 0, 0));
    store.todayTasks = [];
    rerender(<GoalsList />);

    expect(screen.getByText('Unfinished tasks are below')).toBeInTheDocument();
  });
});

describe('GoalsList - Show completed filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows completed tasks when showCompletedGoals is true (default)', () => {
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
    const done = goalFactory.build({ text: 'Finished thing', completed: true });
    const open = goalFactory.build({ text: 'Open thing', completed: false });
    const store = createMockGoalStore({ todayTasks: [done, open], goals: [done, open] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.getByRole('button', { name: 'Finished thing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open thing' })).toBeInTheDocument();
  });

  it('hides completed tasks when showCompletedGoals is false', () => {
    vi.mocked(useSettingsStore).mockImplementation(
      createSettingsStoreMock({ showCompletedGoals: false })
    );
    const done = goalFactory.build({ text: 'Finished thing', completed: true });
    const open = goalFactory.build({ text: 'Open thing', completed: false });
    const store = createMockGoalStore({ todayTasks: [done, open], goals: [done, open] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.queryByRole('button', { name: 'Finished thing' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open thing' })).toBeInTheDocument();
  });
});

describe('GoalsList - Empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  it('shows the empty-state title when there are no today tasks', () => {
    const store = createMockGoalStore({ todayTasks: [], goals: [] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList />);

    expect(screen.getByText('No tasks for today')).toBeInTheDocument();
  });

  it('renders the goal input instead of an empty state in compact mode with no tasks', () => {
    const store = createMockGoalStore({ todayTasks: [], goals: [] });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));

    render(<GoalsList viewMode="compact" />);

    expect(screen.queryByText('No tasks for today')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('GoalsList - Link to goal picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock());
  });

  // The task is pre-linked so its trigger reads "Change linked goal" — unique in
  // the tree (the add-row's GoalInput button is also named "Link to goal").
  function renderLinkedTaskInEditMode(storeOverrides: Partial<MockGoalStore> = {}) {
    const objective = goalFactory.build({ text: 'Ship the release', completed: false });
    const task = goalFactory.build({
      text: 'Write report',
      completed: false,
      parentId: objective.id,
    });
    const store = createMockGoalStore({
      todayTasks: [task],
      goals: [task, objective],
      getActiveGoals: vi.fn(() => [objective]),
      ...storeOverrides,
    });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    render(<GoalsList />);
    return { task, objective, store };
  }

  it('mousedown on the link trigger must not steal focus from the edit input', async () => {
    const user = userEvent.setup();
    renderLinkedTaskInEditMode();
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    // Preventing mousedown's default is the fix (see keepEditFocus); fireEvent
    // returns false exactly when the default was prevented.
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Change linked goal' }))).toBe(
      false
    );
    expect(screen.getByDisplayValue('Write report')).toBeInTheDocument();
  });

  it('opens the picker and picks a goal without closing the edit row early', async () => {
    const user = userEvent.setup();
    const { task, objective, store } = renderLinkedTaskInEditMode();
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    await user.click(screen.getByRole('button', { name: 'Change linked goal' }));

    // The edit row must survive the trigger click (the WebKit regression closed it).
    expect(screen.getByDisplayValue('Write report')).toBeInTheDocument();

    const entry = await screen.findByRole('button', { name: /Ship the release/ });
    // Chromium focuses buttons on mousedown — picker items need the same blur guard.
    expect(fireEvent.mouseDown(entry)).toBe(false);
    await user.click(entry);

    expect(store.linkTaskToGoal).toHaveBeenCalledWith(task.id, objective.id);
    // A successful pick ends the edit flow.
    expect(screen.queryByDisplayValue('Write report')).not.toBeInTheDocument();
  });

  it('a failed link keeps the picker and edit row open for a retry', async () => {
    const user = userEvent.setup();
    renderLinkedTaskInEditMode({ linkTaskToGoal: vi.fn(async () => false) });
    await user.click(screen.getByRole('button', { name: 'Write report' }));
    await user.click(screen.getByRole('button', { name: 'Change linked goal' }));

    await user.click(await screen.findByRole('button', { name: /Ship the release/ }));

    // The store toasts "try again" — tearing down the picker would make that a lie.
    expect(screen.getByRole('button', { name: 'Remove link' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Write report')).toBeInTheDocument();
  });

  it('committing with enter while the picker is open does not prime it to reopen', async () => {
    const user = userEvent.setup();
    renderLinkedTaskInEditMode();
    await user.click(screen.getByRole('button', { name: 'Write report' }));
    await user.click(screen.getByRole('button', { name: 'Change linked goal' }));
    await screen.findByRole('button', { name: 'Remove link' });

    // Focus stayed in the input (pointer open), so Enter commits the edit; the
    // controlled popover unmounts without ever firing onOpenChange.
    await user.keyboard('{Enter}');
    expect(screen.queryByDisplayValue('Write report')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Write report' }));

    expect(screen.queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument();
  });

  it('a keyboard open hands focus to the picker, not the edit input', async () => {
    const user = userEvent.setup();
    renderLinkedTaskInEditMode();
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    const trigger = screen.getByRole('button', { name: 'Change linked goal' });
    trigger.focus();
    await user.keyboard('{Enter}');

    // Radix's focus-into-content must proceed for keyboard users — only pointer
    // opens (focus still in the input) suppress it.
    const picker = await screen.findByRole('dialog');
    expect(picker).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByDisplayValue('Write report')).toBeInTheDocument();
  });
});
