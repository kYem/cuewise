import type { Goal, Subtask } from '@cuewise/shared';
import { getNextDayDateString, getTodayDateString } from '@cuewise/shared';
import { Factory } from 'fishery';

export const goalFactory = Factory.define<Goal>(({ sequence }) => ({
  id: `goal-${sequence}`,
  text: `Test goal ${sequence}`,
  completed: false,
  createdAt: new Date().toISOString(),
  date: getTodayDateString(),
}));

export const completedGoalFactory = goalFactory.params({
  completed: true,
});

export const subtaskFactory = Factory.define<Subtask>(({ sequence }) => ({
  id: `subtask-${sequence}`,
  text: `Test subtask ${sequence}`,
  completed: false,
}));

export const taskWithDueDateFactory = goalFactory.params({
  type: 'task',
  dueDate: getNextDayDateString(),
});

export const taskWithSubtasksFactory = goalFactory.params({
  type: 'task',
  subtasks: [
    { id: 'sub-1', text: 'Subtask 1', completed: false },
    { id: 'sub-2', text: 'Subtask 2', completed: false },
  ],
});

export const objectiveFactory = goalFactory.params({
  type: 'objective',
  description: 'Test objective description',
});
