import { getTodayDateString, storageFailure } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import {
  completedGoalFactory,
  goalFactory,
  objectiveFactory,
  taskWithSubtasksFactory,
} from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from './goal-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getGoals: vi.fn(),
  setGoals: vi.fn(),
}));

// Mock toast store with module-level fns so each level is inspectable across getState() calls.
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastSuccess = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: toastError,
      warning: toastWarning,
      success: toastSuccess,
    }),
  },
}));

// Spy on the celebration store so we can assert toggleTask never triggers it
// (the all-goals confetti was removed in favour of the per-checkbox tick).
const { celebrateMock } = vi.hoisted(() => ({ celebrateMock: vi.fn() }));

vi.mock('./celebration-store', () => ({
  useCelebrationStore: {
    getState: () => ({ celebrate: celebrateMock, active: null, dismiss: vi.fn() }),
  },
}));

describe('Goal Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGoalStore.setState({
      goals: [],
      todayTasks: [],
      isLoading: true,
      error: null,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load goals and filter today goals', async () => {
      const today = getTodayDateString();
      const todayTasks = goalFactory.buildList(3, { date: today });
      const yesterdayGoals = goalFactory.buildList(2, { date: '2025-01-01' });
      const allGoals = [...todayTasks, ...yesterdayGoals];

      vi.mocked(storage.getGoals).mockResolvedValue(allGoals);

      await useGoalStore.getState().initialize();

      const state = useGoalStore.getState();
      expect(state.goals).toEqual(allGoals);
      expect(state.todayTasks).toEqual(todayTasks);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(null);
    });

    it('should handle errors and set error state', async () => {
      vi.mocked(storage.getGoals).mockRejectedValue(new Error('Storage error'));

      await useGoalStore.getState().initialize();

      const state = useGoalStore.getState();
      expect(state.error).toBeTruthy();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addGoal', () => {
    it('should add a new goal for today', async () => {
      const existingGoals = goalFactory.buildList(2);
      useGoalStore.setState({ goals: existingGoals });

      const goalText = 'New goal text';
      await useGoalStore.getState().addTask(goalText);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      expect(updatedGoals).toHaveLength(3);

      const addedGoal = updatedGoals[2];
      expect(addedGoal.text).toBe(goalText);
      expect(addedGoal.completed).toBe(false);
      expect(addedGoal.date).toBe(getTodayDateString());
    });

    it('should not add goal with empty text', async () => {
      const existingGoals = goalFactory.buildList(2);
      useGoalStore.setState({ goals: existingGoals });

      await useGoalStore.getState().addTask('   ');

      expect(storage.setGoals).not.toHaveBeenCalled();
    });

    it('should trim goal text', async () => {
      useGoalStore.setState({ goals: [] });

      await useGoalStore.getState().addTask('  Goal with spaces  ');

      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      expect(updatedGoals[0].text).toBe('Goal with spaces');
    });
  });

  describe('toggleGoal', () => {
    it('should toggle goal completion status', async () => {
      const today = getTodayDateString();
      const mockGoals = goalFactory.buildList(3, { date: today, completed: false });
      const targetGoal = mockGoals[0];

      useGoalStore.setState({ goals: mockGoals });

      await useGoalStore.getState().toggleTask(targetGoal.id);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const toggledGoal = updatedGoals.find((g) => g.id === targetGoal.id);
      expect(toggledGoal?.completed).toBe(true);
    });

    it('should toggle from completed to incomplete', async () => {
      const today = getTodayDateString();
      const completedGoal = completedGoalFactory.build({ date: today });
      const mockGoals = [completedGoal];

      useGoalStore.setState({ goals: mockGoals });

      await useGoalStore.getState().toggleTask(completedGoal.id);

      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const toggledGoal = updatedGoals.find((g) => g.id === completedGoal.id);
      expect(toggledGoal?.completed).toBe(false);
    });
  });

  describe('deleteGoal', () => {
    it('should remove goal from list', async () => {
      const today = getTodayDateString();
      const mockGoals = goalFactory.buildList(3, { date: today });
      const targetGoal = mockGoals[1];

      useGoalStore.setState({ goals: mockGoals, todayTasks: mockGoals });

      await useGoalStore.getState().deleteTask(targetGoal.id);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      expect(updatedGoals).toHaveLength(2);
      expect(updatedGoals.find((g) => g.id === targetGoal.id)).toBeUndefined();
    });
  });

  describe('clearCompleted', () => {
    it('should remove only completed goals from today', async () => {
      const today = getTodayDateString();
      const completedTodayGoals = completedGoalFactory.buildList(2, { date: today });
      const incompleteTodayGoals = goalFactory.buildList(2, { date: today, completed: false });
      const completedYesterdayGoals = completedGoalFactory.buildList(1, { date: '2025-01-01' });

      const allGoals = [
        ...completedTodayGoals,
        ...incompleteTodayGoals,
        ...completedYesterdayGoals,
      ];

      useGoalStore.setState({ goals: allGoals });

      await useGoalStore.getState().clearCompleted();

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];

      // Should have incomplete today goals + completed yesterday goals
      expect(updatedGoals).toHaveLength(3);
      expect(updatedGoals).toEqual(
        expect.arrayContaining([...incompleteTodayGoals, ...completedYesterdayGoals])
      );
    });

    it('should update todayTasks correctly after clearing', async () => {
      const today = getTodayDateString();
      const completedTodayGoals = completedGoalFactory.buildList(2, { date: today });
      const incompleteTodayGoals = goalFactory.buildList(1, { date: today, completed: false });

      useGoalStore.setState({ goals: [...completedTodayGoals, ...incompleteTodayGoals] });

      await useGoalStore.getState().clearCompleted();

      const state = useGoalStore.getState();
      expect(state.todayTasks).toHaveLength(1);
      expect(state.todayTasks[0]).toMatchObject(incompleteTodayGoals[0]);
    });
  });

  describe('moveGoalToToday', () => {
    it('should move a past goal to today', async () => {
      const today = getTodayDateString();
      const pastGoal = goalFactory.build({ date: '2025-01-01', completed: false });
      const todayGoal = goalFactory.build({ date: today });

      useGoalStore.setState({ goals: [pastGoal, todayGoal], todayTasks: [todayGoal] });

      await useGoalStore.getState().moveTaskToToday(pastGoal.id);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const movedGoal = updatedGoals.find((g) => g.id === pastGoal.id);

      expect(movedGoal?.date).toBe(today);
    });

    it('should reset completion status when moving to today', async () => {
      const today = getTodayDateString();
      const pastCompletedGoal = completedGoalFactory.build({ date: '2025-01-01' });

      useGoalStore.setState({ goals: [pastCompletedGoal], todayTasks: [] });

      await useGoalStore.getState().moveTaskToToday(pastCompletedGoal.id);

      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const movedGoal = updatedGoals.find((g) => g.id === pastCompletedGoal.id);

      expect(movedGoal?.date).toBe(today);
      expect(movedGoal?.completed).toBe(false);
    });

    it('should update todayTasks after moving', async () => {
      const pastGoal = goalFactory.build({ date: '2025-01-01', completed: false });

      useGoalStore.setState({ goals: [pastGoal], todayTasks: [] });

      await useGoalStore.getState().moveTaskToToday(pastGoal.id);

      const state = useGoalStore.getState();
      expect(state.todayTasks).toHaveLength(1);
      expect(state.todayTasks[0].id).toBe(pastGoal.id);
    });
  });

  describe('transferGoalToNextDay', () => {
    it('should transfer goal to tomorrow', async () => {
      const today = getTodayDateString();
      const todayGoal = goalFactory.build({ date: today, completed: false });

      useGoalStore.setState({ goals: [todayGoal], todayTasks: [todayGoal] });

      await useGoalStore.getState().transferTaskToNextDay(todayGoal.id);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const transferredGoal = updatedGoals.find((g) => g.id === todayGoal.id);

      // Should be tomorrow, not today
      expect(transferredGoal?.date).not.toBe(today);
    });

    it('should increment transfer count', async () => {
      const today = getTodayDateString();
      const todayGoal = goalFactory.build({ date: today, transferCount: 2 });

      useGoalStore.setState({ goals: [todayGoal], todayTasks: [todayGoal] });

      await useGoalStore.getState().transferTaskToNextDay(todayGoal.id);

      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const transferredGoal = updatedGoals.find((g) => g.id === todayGoal.id);

      expect(transferredGoal?.transferCount).toBe(3);
    });

    it('should remove goal from todayTasks after transfer', async () => {
      const today = getTodayDateString();
      const todayGoal = goalFactory.build({ date: today });

      useGoalStore.setState({ goals: [todayGoal], todayTasks: [todayGoal] });

      await useGoalStore.getState().transferTaskToNextDay(todayGoal.id);

      const state = useGoalStore.getState();
      expect(state.todayTasks).toHaveLength(0);
    });
  });

  describe('Objectives', () => {
    describe('addObjective', () => {
      it('should add a new objective', async () => {
        useGoalStore.setState({ goals: [] });

        await useGoalStore.getState().addGoal('Learn TypeScript', '2025-02-15', 'Master TS');

        expect(storage.setGoals).toHaveBeenCalled();
        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals).toHaveLength(1);

        const addedObjective = updatedGoals[0];
        expect(addedObjective.text).toBe('Learn TypeScript');
        expect(addedObjective.type).toBe('objective');
        expect(addedObjective.date).toBe('2025-02-15');
        expect(addedObjective.description).toBe('Master TS');
        expect(addedObjective.completed).toBe(false);
      });

      it('should not add objective with empty title', async () => {
        useGoalStore.setState({ goals: [] });

        await useGoalStore.getState().addGoal('  ', '2025-02-15');

        expect(storage.setGoals).not.toHaveBeenCalled();
      });

      it('should trim objective title and description', async () => {
        useGoalStore.setState({ goals: [] });

        await useGoalStore.getState().addGoal('  Title  ', '2025-02-15', '  Description  ');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].text).toBe('Title');
        expect(updatedGoals[0].description).toBe('Description');
      });
    });

    describe('updateObjective', () => {
      it('should update objective text', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateGoal('obj-1', { text: 'Updated Title' });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].text).toBe('Updated Title');
      });

      it('should update objective description', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateGoal('obj-1', { description: 'New description' });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].description).toBe('New description');
      });

      it('should update objective due date', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateGoal('obj-1', { date: '2025-03-01' });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].date).toBe('2025-03-01');
      });

      it('should mark objective as completed', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateGoal('obj-1', { completed: true });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].completed).toBe(true);
      });

      it('should reopen completed objective', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1', completed: true });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateGoal('obj-1', { completed: false });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].completed).toBe(false);
      });
    });

    describe('deleteObjective', () => {
      it('should delete objective', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().deleteGoal('obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals).toHaveLength(0);
      });

      it('should orphan linked tasks when objective is deleted', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        const linkedTask = goalFactory.build({ parentId: 'obj-1', id: 'task-1' });
        useGoalStore.setState({ goals: [objective, linkedTask] });

        await useGoalStore.getState().deleteGoal('obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals).toHaveLength(1);
        expect(updatedGoals[0].id).toBe('task-1');
        expect(updatedGoals[0].parentId).toBeUndefined();
      });
    });

    describe('linkTaskToGoal', () => {
      it('should link task to objective', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        const task = goalFactory.build({ id: 'task-1' });
        useGoalStore.setState({ goals: [objective, task] });

        await useGoalStore.getState().linkTaskToGoal('task-1', 'obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const linkedTask = updatedGoals.find((g) => g.id === 'task-1');
        expect(linkedTask?.parentId).toBe('obj-1');
      });

      it('should unlink task from objective', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        const linkedTask = goalFactory.build({ parentId: 'obj-1', id: 'task-1' });
        useGoalStore.setState({ goals: [objective, linkedTask] });

        await useGoalStore.getState().linkTaskToGoal('task-1', null);

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const unlinkedTask = updatedGoals.find((g) => g.id === 'task-1');
        expect(unlinkedTask?.parentId).toBeUndefined();
      });

      it('should change linked objective', async () => {
        const objective1 = objectiveFactory.build({ id: 'obj-1' });
        const objective2 = objectiveFactory.build({ id: 'obj-2' });
        const linkedTask = goalFactory.build({ parentId: 'obj-1', id: 'task-1' });
        useGoalStore.setState({ goals: [objective1, objective2, linkedTask] });

        await useGoalStore.getState().linkTaskToGoal('task-1', 'obj-2');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const relinkedTask = updatedGoals.find((g) => g.id === 'task-1');
        expect(relinkedTask?.parentId).toBe('obj-2');
      });
    });

    describe('getObjectives', () => {
      it('should return only objectives', () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        const task = goalFactory.build({ id: 'task-1' });
        useGoalStore.setState({ goals: [objective, task] });

        const objectives = useGoalStore.getState().getGoals();

        expect(objectives).toHaveLength(1);
        expect(objectives[0].id).toBe('obj-1');
      });
    });

    describe('getActiveGoals', () => {
      it('should return only incomplete objectives', () => {
        const activeGoal = objectiveFactory.build({ id: 'obj-1', completed: false });
        const completedObjective = objectiveFactory.build({ id: 'obj-2', completed: true });
        useGoalStore.setState({ goals: [activeGoal, completedObjective] });

        const activeGoals = useGoalStore.getState().getActiveGoals();

        expect(activeGoals).toHaveLength(1);
        expect(activeGoals[0].id).toBe('obj-1');
      });
    });

    describe('getGoalProgress', () => {
      it('should return progress for objective with no tasks', () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        const progress = useGoalStore.getState().getGoalProgress('obj-1');

        expect(progress).not.toBeNull();
        expect(progress?.total).toBe(0);
        expect(progress?.completed).toBe(0);
        expect(progress?.percent).toBe(0);
      });

      it('should calculate progress for objective with tasks', () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        const task1 = goalFactory.build({ parentId: 'obj-1', id: 'task-1', completed: true });
        const task2 = goalFactory.build({ parentId: 'obj-1', id: 'task-2', completed: false });
        useGoalStore.setState({ goals: [objective, task1, task2] });

        const progress = useGoalStore.getState().getGoalProgress('obj-1');

        expect(progress?.total).toBe(2);
        expect(progress?.completed).toBe(1);
        expect(progress?.percent).toBe(50);
      });

      it('should return null for non-existent objective', () => {
        useGoalStore.setState({ goals: [] });

        const progress = useGoalStore.getState().getGoalProgress('non-existent');

        expect(progress).toBeNull();
      });
    });

    describe('getLinkedTasks', () => {
      it('should return tasks linked to objective', () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        const linkedTask = goalFactory.build({ parentId: 'obj-1', id: 'task-1' });
        const unlinkedTask = goalFactory.build({ id: 'task-2' });
        useGoalStore.setState({ goals: [objective, linkedTask, unlinkedTask] });

        const linkedTasks = useGoalStore.getState().getLinkedTasks('obj-1');

        expect(linkedTasks).toHaveLength(1);
        expect(linkedTasks[0].id).toBe('task-1');
      });
    });

    describe('addGoal with parentId', () => {
      it('should add a task linked to an objective', async () => {
        const objective = objectiveFactory.build({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().addTask('New linked task', 'obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const addedTask = updatedGoals.find((g) => g.text === 'New linked task');
        expect(addedTask?.parentId).toBe('obj-1');
      });
    });

    describe('initialize excludes objectives from todayTasks', () => {
      it('should not include objectives in todayTasks', async () => {
        const today = getTodayDateString();
        const todayTask = goalFactory.build({ date: today });
        const todayObjective = objectiveFactory.build({ date: today });

        vi.mocked(storage.getGoals).mockResolvedValue([todayTask, todayObjective]);

        await useGoalStore.getState().initialize();

        const state = useGoalStore.getState();
        expect(state.todayTasks).toHaveLength(1);
        expect(state.todayTasks[0].id).toBe(todayTask.id);
      });
    });
  });

  describe('Task Enhancement Actions', () => {
    describe('duplicateTask', () => {
      it('should create a copy of a task with a new ID', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today, text: 'Original' });

        vi.mocked(storage.getGoals).mockResolvedValue([task]);
        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });

        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().duplicateTask(task.id);

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.goals).toHaveLength(2);
        expect(state.goals[1].text).toBe('Original');
        expect(state.goals[1].id).not.toBe(task.id);
        expect(state.goals[1].completed).toBe(false);
      });

      it('should return false for non-existent task', async () => {
        useGoalStore.setState({ goals: [], todayTasks: [] });

        const result = await useGoalStore.getState().duplicateTask('non-existent');

        expect(result).toBe(false);
      });

      it('should not duplicate objectives', async () => {
        const objective = objectiveFactory.build();

        useGoalStore.setState({ goals: [objective], todayTasks: [] });

        const result = await useGoalStore.getState().duplicateTask(objective.id);

        expect(result).toBe(false);
      });
    });

    describe('setTaskDueDate', () => {
      it('should set a due date on a task', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().setTaskDueDate(task.id, '2026-05-01');

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.goals[0].dueDate).toBe('2026-05-01');
      });

      it('should remove due date when set to null', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today, dueDate: '2026-05-01' });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().setTaskDueDate(task.id, null);

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.goals[0].dueDate).toBeUndefined();
      });
    });

    describe('addSubtask', () => {
      it('should add a subtask to a task', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().addSubtask(task.id, 'New subtask');

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.goals[0].subtasks).toHaveLength(1);
        expect(state.goals[0].subtasks?.[0].text).toBe('New subtask');
        expect(state.goals[0].subtasks?.[0].completed).toBe(false);
      });

      it('should return false for empty text', async () => {
        const result = await useGoalStore.getState().addSubtask('task-1', '   ');

        expect(result).toBe(false);
      });
    });

    describe('toggleSubtask', () => {
      it('should toggle a subtask completion', async () => {
        const today = getTodayDateString();
        const task = taskWithSubtasksFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        // taskWithSubtasksFactory uses hardcoded IDs: 'sub-1', 'sub-2'
        const result = await useGoalStore.getState().toggleSubtask(task.id, 'sub-1');

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.goals[0].subtasks?.[0].completed).toBe(true);
      });

      it('completes the parent task once every subtask is checked', async () => {
        const today = getTodayDateString();
        const task = taskWithSubtasksFactory.build({ date: today, completed: false });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        // taskWithSubtasksFactory uses hardcoded IDs: 'sub-1', 'sub-2'
        await useGoalStore.getState().toggleSubtask(task.id, 'sub-1');
        await useGoalStore.getState().toggleSubtask(task.id, 'sub-2');

        const state = useGoalStore.getState();
        expect(state.goals[0].subtasks?.every((s) => s.completed)).toBe(true);
        expect(state.goals[0].completed).toBe(true);
      });
    });

    describe('removeSubtask', () => {
      it('should remove a subtask', async () => {
        const today = getTodayDateString();
        const task = taskWithSubtasksFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        // taskWithSubtasksFactory uses hardcoded IDs: 'sub-1', 'sub-2'
        const result = await useGoalStore.getState().removeSubtask(task.id, 'sub-1');

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.goals[0].subtasks).toHaveLength(1);
      });
    });

    describe('reorderTasks', () => {
      it('should reorder today tasks and update sortOrder', async () => {
        const today = getTodayDateString();
        const task1 = goalFactory.build({ date: today, text: 'First', sortOrder: 0 });
        const task2 = goalFactory.build({ date: today, text: 'Second', sortOrder: 1 });
        const task3 = goalFactory.build({ date: today, text: 'Third', sortOrder: 2 });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({
          goals: [task1, task2, task3],
          todayTasks: [task1, task2, task3],
        });

        const result = await useGoalStore.getState().reorderTasks(0, 2);

        expect(result).toBe(true);
        const state = useGoalStore.getState();
        expect(state.todayTasks.map((t) => t.text)).toEqual(['Second', 'Third', 'First']);
        expect(state.todayTasks[0].sortOrder).toBe(0);
        expect(state.todayTasks[1].sortOrder).toBe(1);
        expect(state.todayTasks[2].sortOrder).toBe(2);
      });
    });

    describe('todayTasks respects sortOrder', () => {
      it('should sort today tasks by sortOrder', async () => {
        const today = getTodayDateString();
        const task1 = goalFactory.build({ date: today, text: 'C', sortOrder: 2 });
        const task2 = goalFactory.build({ date: today, text: 'A', sortOrder: 0 });
        const task3 = goalFactory.build({ date: today, text: 'B', sortOrder: 1 });

        vi.mocked(storage.getGoals).mockResolvedValue([task1, task2, task3]);

        await useGoalStore.getState().initialize();

        const state = useGoalStore.getState();
        expect(state.todayTasks.map((t) => t.text)).toEqual(['A', 'B', 'C']);
      });
    });

    describe('error handling for new actions', () => {
      it('duplicateTask should handle storage errors', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockRejectedValue(new Error('Storage error'));
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().duplicateTask(task.id);

        expect(result).toBe(false);
        expect(useGoalStore.getState().error).toBeTruthy();
        expect(useGoalStore.getState().goals).toHaveLength(1); // unchanged
      });

      it('setTaskDueDate should handle storage errors', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockRejectedValue(new Error('Storage error'));
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().setTaskDueDate(task.id, '2026-05-01');

        expect(result).toBe(false);
        expect(useGoalStore.getState().error).toBeTruthy();
      });

      it('setTaskDueDate should return false for non-existent goal', async () => {
        useGoalStore.setState({ goals: [], todayTasks: [] });

        const result = await useGoalStore.getState().setTaskDueDate('non-existent', '2026-05-01');

        expect(result).toBe(false);
      });

      it('addSubtask should handle storage errors', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today });

        vi.mocked(storage.setGoals).mockRejectedValue(new Error('Storage error'));
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        const result = await useGoalStore.getState().addSubtask(task.id, 'New subtask');

        expect(result).toBe(false);
        expect(useGoalStore.getState().error).toBeTruthy();
      });

      it('addSubtask should return false for non-existent goal', async () => {
        useGoalStore.setState({ goals: [], todayTasks: [] });

        const result = await useGoalStore.getState().addSubtask('non-existent', 'Text');

        expect(result).toBe(false);
      });

      it('reorderTasks should handle storage errors', async () => {
        const today = getTodayDateString();
        const task1 = goalFactory.build({ date: today, sortOrder: 0 });
        const task2 = goalFactory.build({ date: today, sortOrder: 1 });

        vi.mocked(storage.setGoals).mockRejectedValue(new Error('Storage error'));
        useGoalStore.setState({ goals: [task1, task2], todayTasks: [task1, task2] });

        const result = await useGoalStore.getState().reorderTasks(0, 1);

        expect(result).toBe(false);
        expect(useGoalStore.getState().error).toBeTruthy();
      });
    });

    describe('reorderTasks full goals array', () => {
      it('should update sortOrder in the full goals array and leave non-today goals untouched', async () => {
        const today = getTodayDateString();
        const todayTask1 = goalFactory.build({ date: today, text: 'A', sortOrder: 0 });
        const todayTask2 = goalFactory.build({ date: today, text: 'B', sortOrder: 1 });
        const yesterdayTask = goalFactory.build({ date: '2025-01-01', text: 'Old', sortOrder: 5 });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({
          goals: [todayTask1, todayTask2, yesterdayTask],
          todayTasks: [todayTask1, todayTask2],
        });

        await useGoalStore.getState().reorderTasks(0, 1);

        const state = useGoalStore.getState();
        // Today tasks reordered
        expect(state.todayTasks.map((t) => t.text)).toEqual(['B', 'A']);

        // Full goals array also updated
        const goalA = state.goals.find((g) => g.id === todayTask1.id);
        const goalB = state.goals.find((g) => g.id === todayTask2.id);
        expect(goalB?.sortOrder).toBe(0);
        expect(goalA?.sortOrder).toBe(1);

        // Non-today goal untouched
        const oldGoal = state.goals.find((g) => g.id === yesterdayTask.id);
        expect(oldGoal?.sortOrder).toBe(5);
      });
    });

    describe('duplicateTask todayTasks integration', () => {
      it('should add duplicate to todayTasks', async () => {
        const today = getTodayDateString();
        const task = goalFactory.build({ date: today, text: 'Original' });

        vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
        useGoalStore.setState({ goals: [task], todayTasks: [task] });

        await useGoalStore.getState().duplicateTask(task.id);

        const state = useGoalStore.getState();
        expect(state.todayTasks).toHaveLength(2);
        expect(state.todayTasks[1].text).toBe('Original');
        expect(state.todayTasks[1].id).not.toBe(task.id);
      });
    });
  });
});

describe('toggleTask does not celebrate (confetti removed)', () => {
  beforeEach(() => {
    celebrateMock.mockClear();
    vi.mocked(storage.setGoals).mockResolvedValue({ success: true });
  });

  it('does not celebrate when completing the last incomplete task today', async () => {
    const today = getTodayDateString();
    const done = goalFactory.build({ date: today, completed: true });
    const last = goalFactory.build({ date: today, completed: false });
    useGoalStore.setState({ goals: [done, last], todayTasks: [done, last] });

    await useGoalStore.getState().toggleTask(last.id);

    expect(celebrateMock).not.toHaveBeenCalled();
  });
});

describe('toggleTask persistence', () => {
  it('reports failure and does not optimistically complete when the save fails', async () => {
    vi.mocked(storage.setGoals).mockResolvedValue(storageFailure('write failed'));
    const task = goalFactory.build({ date: getTodayDateString(), completed: false });
    useGoalStore.setState({ goals: [task], todayTasks: [task] });

    const result = await useGoalStore.getState().toggleTask(task.id);

    expect(result).toBe(false);
    expect(useGoalStore.getState().goals[0].completed).toBe(false);
  });
});
