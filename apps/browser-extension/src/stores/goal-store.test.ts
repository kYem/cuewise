import { getTodayDateString } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { completedGoalFactory, goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from './goal-store';

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
});
