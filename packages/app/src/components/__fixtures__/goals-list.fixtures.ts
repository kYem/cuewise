import { type Goal, getYesterdayDateString, type Settings } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock, type MockStoreOf } from '@cuewise/test-utils';
import { goalFactory } from '@cuewise/test-utils/factories';
import { type Mock, vi } from 'vitest';
import { useCalendarStore } from '../../stores/calendar-store';
import { type CompletionFilter, useGoalStore } from '../../stores/goal-store';
import { useSettingsStore } from '../../stores/settings-store';

// Re-exported so existing GoalsList test imports keep resolving from this file.
export { createSettingsStoreMock };

/**
 * Shared fixtures for GoalsList component tests.
 * Provides a fully-stubbed goal store and settings store so the large
 * GoalsList component can be rendered in isolation.
 */

type GoalStore = ReturnType<typeof useGoalStore.getState>;

export type MockGoalStore = MockStoreOf<
  GoalStore,
  | 'todayTasks'
  | 'goals'
  | 'isLoading'
  | 'toggleTask'
  | 'updateTask'
  | 'deleteTask'
  | 'transferTaskToNextDay'
  | 'moveTaskToToday'
  | 'moveTasksToToday'
  | 'getActiveGoals'
  | 'getGoalProgress'
  | 'linkTaskToGoal'
  | 'duplicateTask'
  | 'setTaskDueDate'
  | 'addSubtask'
  | 'toggleSubtask'
  | 'removeSubtask'
  | 'reorderTasks'
>;

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
 * bare `useGoalStore()` call and selector functions.
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

export type MockGoalsPageStore = MockGoalStore &
  MockStoreOf<GoalStore, 'initialize' | 'addTask' | 'completionFilter' | 'setCompletionFilter'>;

/**
 * Mocks the goal, calendar and settings stores that GoalsSection and its real children read.
 * The calling test must `vi.mock` all three modules.
 */
export function mockGoalsSectionStores(
  settings: Partial<Settings> & { updateSettings?: Mock },
  tasks: Goal[] = [goalFactory.build({ completed: false })],
  state: { isLoading?: boolean; error?: string | null } = {}
): MockGoalStore {
  const store: MockGoalStore & MockStoreOf<GoalStore, 'error' | 'initialize' | 'addTask'> = {
    ...createMockGoalStore({ todayTasks: tasks, goals: tasks, isLoading: state.isLoading }),
    error: state.error ?? null,
    initialize: vi.fn(),
    addTask: vi.fn(async () => true),
  };
  const calendar: MockStoreOf<ReturnType<typeof useCalendarStore.getState>, 'initialize'> = {
    initialize: vi.fn(),
  };
  vi.mocked(useGoalStore).mockImplementation(createSelectorMock(store));
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock(calendar));
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ showCompletedGoals: false, ...settings })
  );
  return store;
}

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
