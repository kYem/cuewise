import type { Goal } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { type Mock, vi } from 'vitest';

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
    isLoading: false,
    toggleTask: vi.fn(async () => true),
    updateTask: vi.fn(async () => true),
    deleteTask: vi.fn(async () => true),
    transferTaskToNextDay: vi.fn(async () => true),
    moveTaskToToday: vi.fn(async () => true),
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
  return createSelectorMock(store);
}
