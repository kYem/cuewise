import { type Goal, getYesterdayDateString } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory } from '@cuewise/test-utils/factories';
import { type Mock, vi } from 'vitest';
import type { CompletionFilter } from '../../stores/goal-store';

// Re-exported so existing GoalsList test imports keep resolving from this file.
export { createSettingsStoreMock };

/**
 * Shared fixtures for GoalsList component tests.
 * Provides a fully-stubbed goal store and settings store so the large
 * GoalsList component can be rendered in isolation.
 */

export interface MockGoalStore {
  todayTasks: Goal[];
  goals: Goal[];
  isLoading: boolean;
  toggleTask: Mock;
  updateTask: Mock;
  deleteTask: Mock;
  transferTaskToNextDay: Mock;
  moveTaskToToday: Mock;
  moveTasksToToday: Mock;
  getActiveGoals: Mock;
  getGoalProgress: Mock;
  linkTaskToGoal: Mock;
  clearCompleted: Mock;
  // Task Enhancement actions (Phase 2)
  duplicateTask: Mock;
  setTaskDueDate: Mock;
  addSubtask: Mock;
  toggleSubtask: Mock;
  removeSubtask: Mock;
  reorderTasks: Mock;
}

export function createMockGoalStore(overrides: Partial<MockGoalStore> = {}): MockGoalStore {
  return {
    todayTasks: [],
    goals: [],
    isLoading: false,
    toggleTask: vi.fn(async () => true),
    updateTask: vi.fn(async () => true),
    deleteTask: vi.fn(async () => true),
    transferTaskToNextDay: vi.fn(async () => true),
    moveTaskToToday: vi.fn(async () => true),
    moveTasksToToday: vi.fn(async () => true),
    getActiveGoals: vi.fn(() => []),
    getGoalProgress: vi.fn(() => null),
    linkTaskToGoal: vi.fn(async () => true),
    clearCompleted: vi.fn(async () => true),
    duplicateTask: vi.fn(async () => true),
    setTaskDueDate: vi.fn(async () => true),
    addSubtask: vi.fn(async () => true),
    toggleSubtask: vi.fn(async () => true),
    removeSubtask: vi.fn(async () => true),
    reorderTasks: vi.fn(async () => true),
    ...overrides,
  };
}

/**
 * Builds a mock implementation for `useGoalStore` that supports both the
 * bare `useGoalStore()` call and selector functions, and attaches
 * `getState()` (used by GoalsList for clearCompleted).
 */
export function createGoalStoreMock(store: MockGoalStore) {
  return createSelectorMock(store);
}

/** Incomplete tasks dated yesterday — what the Unfinished group surfaces. */
export function buildUnfinishedTasks(count: number): Goal[] {
  return goalFactory.buildList(count, { date: getYesterdayDateString(), completed: false });
}

/** One incomplete task per date, in the order given. */
export function buildUnfinishedTasksOn(dates: string[]): Goal[] {
  return dates.map((date) => goalFactory.build({ date, completed: false }));
}

/** Nothing for today, so the empty state renders with any Unfinished group beneath it. */
export function createNoTodayTasksStore(goals: Goal[]): MockGoalStore {
  return createMockGoalStore({ todayTasks: [], goals });
}

export type MockGoalsPageStore = MockGoalStore & {
  initialize: Mock;
  addTask: Mock;
  completionFilter: CompletionFilter;
  setCompletionFilter: Mock;
};

/** GoalsPage's own reads on top of the GoalsList mock, which already covers UnfinishedBanner. */
export function createGoalsPageStore(
  goals: Goal[],
  completionFilter: CompletionFilter = 'all'
): MockGoalsPageStore {
  return {
    ...createMockGoalStore({ goals }),
    initialize: vi.fn(),
    addTask: vi.fn(async () => true),
    completionFilter,
    setCompletionFilter: vi.fn(),
  };
}
