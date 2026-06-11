import type { Goal, Settings } from '@cuewise/shared';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { type Mock, vi } from 'vitest';

/**
 * Shared fixtures for GoalsList component tests.
 * Provides a fully-stubbed goal store and settings store so the large
 * GoalsList component can be rendered in isolation.
 */

export interface MockGoalStore {
  todayTasks: Goal[];
  goals: Goal[];
  showAllTasks: boolean;
  showUpcoming: boolean;
  isLoading: boolean;
  toggleTask: Mock;
  updateTask: Mock;
  deleteTask: Mock;
  transferTaskToNextDay: Mock;
  moveTaskToToday: Mock;
  toggleShowAllTasks: Mock;
  getActiveGoals: Mock;
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
    showAllTasks: false,
    showUpcoming: false,
    isLoading: false,
    toggleTask: vi.fn(async () => true),
    updateTask: vi.fn(async () => true),
    deleteTask: vi.fn(async () => true),
    transferTaskToNextDay: vi.fn(async () => true),
    moveTaskToToday: vi.fn(async () => true),
    toggleShowAllTasks: vi.fn(),
    getActiveGoals: vi.fn(() => []),
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
  // biome-ignore lint/suspicious/noExplicitAny: selector accepts the store state
  const mock = (selector?: (state: any) => unknown) => {
    if (selector) {
      return selector(store);
    }
    return store;
  };
  mock.getState = () => store;
  return mock;
}

export function createSettingsStoreMock(settingsOverrides: Partial<Settings> = {}) {
  return () => ({ settings: { ...defaultSettings, ...settingsOverrides } });
}
