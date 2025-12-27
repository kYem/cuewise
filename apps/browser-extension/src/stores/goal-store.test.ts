import { type Goal, getTodayDateString } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { completedGoalFactory, goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from './goal-store';

// Helper to create an objective
const createObjective = (overrides: Partial<Goal> = {}): Goal => ({
  id: `obj-${Date.now()}`,
  text: 'Test Objective',
  completed: false,
  createdAt: new Date().toISOString(),
  date: getTodayDateString(),
  type: 'objective',
  ...overrides,
});

// Helper to create a task linked to an objective
const createLinkedTask = (objectiveId: string, overrides: Partial<Goal> = {}): Goal =>
  goalFactory.build({
    parentId: objectiveId,
    ...overrides,
  });

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getGoals: vi.fn(),
  setGoals: vi.fn(),
}));

// Mock toast store
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

describe('Goal Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGoalStore.setState({
      goals: [],
      todayGoals: [],
      isLoading: true,
      error: null,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load goals and filter today goals', async () => {
      const today = getTodayDateString();
      const todayGoals = goalFactory.buildList(3, { date: today });
      const yesterdayGoals = goalFactory.buildList(2, { date: '2025-01-01' });
      const allGoals = [...todayGoals, ...yesterdayGoals];

      vi.mocked(storage.getGoals).mockResolvedValue(allGoals);

      await useGoalStore.getState().initialize();

      const state = useGoalStore.getState();
      expect(state.goals).toEqual(allGoals);
      expect(state.todayGoals).toEqual(todayGoals);
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
      await useGoalStore.getState().addGoal(goalText);

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

      await useGoalStore.getState().addGoal('   ');

      expect(storage.setGoals).not.toHaveBeenCalled();
    });

    it('should trim goal text', async () => {
      useGoalStore.setState({ goals: [] });

      await useGoalStore.getState().addGoal('  Goal with spaces  ');

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

      await useGoalStore.getState().toggleGoal(targetGoal.id);

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

      await useGoalStore.getState().toggleGoal(completedGoal.id);

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

      useGoalStore.setState({ goals: mockGoals, todayGoals: mockGoals });

      await useGoalStore.getState().deleteGoal(targetGoal.id);

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

    it('should update todayGoals correctly after clearing', async () => {
      const today = getTodayDateString();
      const completedTodayGoals = completedGoalFactory.buildList(2, { date: today });
      const incompleteTodayGoals = goalFactory.buildList(1, { date: today, completed: false });

      useGoalStore.setState({ goals: [...completedTodayGoals, ...incompleteTodayGoals] });

      await useGoalStore.getState().clearCompleted();

      const state = useGoalStore.getState();
      expect(state.todayGoals).toHaveLength(1);
      expect(state.todayGoals[0]).toMatchObject(incompleteTodayGoals[0]);
    });
  });

  describe('moveGoalToToday', () => {
    it('should move a past goal to today', async () => {
      const today = getTodayDateString();
      const pastGoal = goalFactory.build({ date: '2025-01-01', completed: false });
      const todayGoal = goalFactory.build({ date: today });

      useGoalStore.setState({ goals: [pastGoal, todayGoal], todayGoals: [todayGoal] });

      await useGoalStore.getState().moveGoalToToday(pastGoal.id);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const movedGoal = updatedGoals.find((g) => g.id === pastGoal.id);

      expect(movedGoal?.date).toBe(today);
    });

    it('should reset completion status when moving to today', async () => {
      const today = getTodayDateString();
      const pastCompletedGoal = completedGoalFactory.build({ date: '2025-01-01' });

      useGoalStore.setState({ goals: [pastCompletedGoal], todayGoals: [] });

      await useGoalStore.getState().moveGoalToToday(pastCompletedGoal.id);

      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const movedGoal = updatedGoals.find((g) => g.id === pastCompletedGoal.id);

      expect(movedGoal?.date).toBe(today);
      expect(movedGoal?.completed).toBe(false);
    });

    it('should update todayGoals after moving', async () => {
      const pastGoal = goalFactory.build({ date: '2025-01-01', completed: false });

      useGoalStore.setState({ goals: [pastGoal], todayGoals: [] });

      await useGoalStore.getState().moveGoalToToday(pastGoal.id);

      const state = useGoalStore.getState();
      expect(state.todayGoals).toHaveLength(1);
      expect(state.todayGoals[0].id).toBe(pastGoal.id);
    });
  });

  describe('transferGoalToNextDay', () => {
    it('should transfer goal to tomorrow', async () => {
      const today = getTodayDateString();
      const todayGoal = goalFactory.build({ date: today, completed: false });

      useGoalStore.setState({ goals: [todayGoal], todayGoals: [todayGoal] });

      await useGoalStore.getState().transferGoalToNextDay(todayGoal.id);

      expect(storage.setGoals).toHaveBeenCalled();
      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const transferredGoal = updatedGoals.find((g) => g.id === todayGoal.id);

      // Should be tomorrow, not today
      expect(transferredGoal?.date).not.toBe(today);
    });

    it('should increment transfer count', async () => {
      const today = getTodayDateString();
      const todayGoal = goalFactory.build({ date: today, transferCount: 2 });

      useGoalStore.setState({ goals: [todayGoal], todayGoals: [todayGoal] });

      await useGoalStore.getState().transferGoalToNextDay(todayGoal.id);

      const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
      const transferredGoal = updatedGoals.find((g) => g.id === todayGoal.id);

      expect(transferredGoal?.transferCount).toBe(3);
    });

    it('should remove goal from todayGoals after transfer', async () => {
      const today = getTodayDateString();
      const todayGoal = goalFactory.build({ date: today });

      useGoalStore.setState({ goals: [todayGoal], todayGoals: [todayGoal] });

      await useGoalStore.getState().transferGoalToNextDay(todayGoal.id);

      const state = useGoalStore.getState();
      expect(state.todayGoals).toHaveLength(0);
    });
  });

  describe('Objectives', () => {
    describe('addObjective', () => {
      it('should add a new objective', async () => {
        useGoalStore.setState({ goals: [] });

        await useGoalStore.getState().addObjective('Learn TypeScript', '2025-02-15', 'Master TS');

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

        await useGoalStore.getState().addObjective('  ', '2025-02-15');

        expect(storage.setGoals).not.toHaveBeenCalled();
      });

      it('should trim objective title and description', async () => {
        useGoalStore.setState({ goals: [] });

        await useGoalStore.getState().addObjective('  Title  ', '2025-02-15', '  Description  ');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].text).toBe('Title');
        expect(updatedGoals[0].description).toBe('Description');
      });
    });

    describe('updateObjective', () => {
      it('should update objective text', async () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateObjective('obj-1', { text: 'Updated Title' });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].text).toBe('Updated Title');
      });

      it('should update objective description', async () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateObjective('obj-1', { description: 'New description' });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].description).toBe('New description');
      });

      it('should update objective due date', async () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateObjective('obj-1', { date: '2025-03-01' });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].date).toBe('2025-03-01');
      });

      it('should mark objective as completed', async () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateObjective('obj-1', { completed: true });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].completed).toBe(true);
      });

      it('should reopen completed objective', async () => {
        const objective = createObjective({ id: 'obj-1', completed: true });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().updateObjective('obj-1', { completed: false });

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals[0].completed).toBe(false);
      });
    });

    describe('deleteObjective', () => {
      it('should delete objective', async () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().deleteObjective('obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals).toHaveLength(0);
      });

      it('should orphan linked tasks when objective is deleted', async () => {
        const objective = createObjective({ id: 'obj-1' });
        const linkedTask = createLinkedTask('obj-1', { id: 'task-1' });
        useGoalStore.setState({ goals: [objective, linkedTask] });

        await useGoalStore.getState().deleteObjective('obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        expect(updatedGoals).toHaveLength(1);
        expect(updatedGoals[0].id).toBe('task-1');
        expect(updatedGoals[0].parentId).toBeUndefined();
      });
    });

    describe('linkTaskToObjective', () => {
      it('should link task to objective', async () => {
        const objective = createObjective({ id: 'obj-1' });
        const task = goalFactory.build({ id: 'task-1' });
        useGoalStore.setState({ goals: [objective, task] });

        await useGoalStore.getState().linkTaskToObjective('task-1', 'obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const linkedTask = updatedGoals.find((g) => g.id === 'task-1');
        expect(linkedTask?.parentId).toBe('obj-1');
      });

      it('should unlink task from objective', async () => {
        const objective = createObjective({ id: 'obj-1' });
        const linkedTask = createLinkedTask('obj-1', { id: 'task-1' });
        useGoalStore.setState({ goals: [objective, linkedTask] });

        await useGoalStore.getState().linkTaskToObjective('task-1', null);

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const unlinkedTask = updatedGoals.find((g) => g.id === 'task-1');
        expect(unlinkedTask?.parentId).toBeUndefined();
      });

      it('should change linked objective', async () => {
        const objective1 = createObjective({ id: 'obj-1' });
        const objective2 = createObjective({ id: 'obj-2' });
        const linkedTask = createLinkedTask('obj-1', { id: 'task-1' });
        useGoalStore.setState({ goals: [objective1, objective2, linkedTask] });

        await useGoalStore.getState().linkTaskToObjective('task-1', 'obj-2');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const relinkedTask = updatedGoals.find((g) => g.id === 'task-1');
        expect(relinkedTask?.parentId).toBe('obj-2');
      });
    });

    describe('getObjectives', () => {
      it('should return only objectives', () => {
        const objective = createObjective({ id: 'obj-1' });
        const task = goalFactory.build({ id: 'task-1' });
        useGoalStore.setState({ goals: [objective, task] });

        const objectives = useGoalStore.getState().getObjectives();

        expect(objectives).toHaveLength(1);
        expect(objectives[0].id).toBe('obj-1');
      });
    });

    describe('getActiveObjectives', () => {
      it('should return only incomplete objectives', () => {
        const activeObjective = createObjective({ id: 'obj-1', completed: false });
        const completedObjective = createObjective({ id: 'obj-2', completed: true });
        useGoalStore.setState({ goals: [activeObjective, completedObjective] });

        const activeObjectives = useGoalStore.getState().getActiveObjectives();

        expect(activeObjectives).toHaveLength(1);
        expect(activeObjectives[0].id).toBe('obj-1');
      });
    });

    describe('getObjectiveProgress', () => {
      it('should return progress for objective with no tasks', () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        const progress = useGoalStore.getState().getObjectiveProgress('obj-1');

        expect(progress).not.toBeNull();
        expect(progress?.total).toBe(0);
        expect(progress?.completed).toBe(0);
        expect(progress?.percent).toBe(0);
      });

      it('should calculate progress for objective with tasks', () => {
        const objective = createObjective({ id: 'obj-1' });
        const task1 = createLinkedTask('obj-1', { id: 'task-1', completed: true });
        const task2 = createLinkedTask('obj-1', { id: 'task-2', completed: false });
        useGoalStore.setState({ goals: [objective, task1, task2] });

        const progress = useGoalStore.getState().getObjectiveProgress('obj-1');

        expect(progress?.total).toBe(2);
        expect(progress?.completed).toBe(1);
        expect(progress?.percent).toBe(50);
      });

      it('should return null for non-existent objective', () => {
        useGoalStore.setState({ goals: [] });

        const progress = useGoalStore.getState().getObjectiveProgress('non-existent');

        expect(progress).toBeNull();
      });
    });

    describe('getLinkedTasks', () => {
      it('should return tasks linked to objective', () => {
        const objective = createObjective({ id: 'obj-1' });
        const linkedTask = createLinkedTask('obj-1', { id: 'task-1' });
        const unlinkedTask = goalFactory.build({ id: 'task-2' });
        useGoalStore.setState({ goals: [objective, linkedTask, unlinkedTask] });

        const linkedTasks = useGoalStore.getState().getLinkedTasks('obj-1');

        expect(linkedTasks).toHaveLength(1);
        expect(linkedTasks[0].id).toBe('task-1');
      });
    });

    describe('addGoal with parentId', () => {
      it('should add a task linked to an objective', async () => {
        const objective = createObjective({ id: 'obj-1' });
        useGoalStore.setState({ goals: [objective] });

        await useGoalStore.getState().addGoal('New linked task', 'obj-1');

        const updatedGoals = vi.mocked(storage.setGoals).mock.calls[0][0];
        const addedTask = updatedGoals.find((g) => g.text === 'New linked task');
        expect(addedTask?.parentId).toBe('obj-1');
      });
    });

    describe('initialize excludes objectives from todayGoals', () => {
      it('should not include objectives in todayGoals', async () => {
        const today = getTodayDateString();
        const todayTask = goalFactory.build({ date: today });
        const todayObjective = createObjective({ date: today });

        vi.mocked(storage.getGoals).mockResolvedValue([todayTask, todayObjective]);

        await useGoalStore.getState().initialize();

        const state = useGoalStore.getState();
        expect(state.todayGoals).toHaveLength(1);
        expect(state.todayGoals[0].id).toBe(todayTask.id);
      });
    });
  });
});
