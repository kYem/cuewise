import { getNextDayDateString } from '@cuewise/shared';
import {
  goalFactory,
  taskWithDueDateFactory,
  taskWithSubtasksFactory,
} from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import {
  createGoalStoreMock,
  createMockGoalStore,
  createSettingsStoreMock,
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
  function renderLinkedTaskInEditMode() {
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
    });
    vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
    render(<GoalsList />);
    return { task, objective, store };
  }

  it('mousedown on the link trigger must not steal focus from the edit input', async () => {
    const user = userEvent.setup();
    renderLinkedTaskInEditMode();
    await user.click(screen.getByRole('button', { name: 'Write report' }));

    // WebKit fires the input's blur with relatedTarget=null on button clicks, which
    // ends editing and unmounts the picker — preventing mousedown's default is the
    // fix, and fireEvent returns false exactly when the default was prevented.
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
    await screen.findByRole('button', { name: 'Remove link' });
    expect(trigger).not.toHaveFocus();
    expect(screen.getByDisplayValue('Write report')).toBeInTheDocument();
  });
});
