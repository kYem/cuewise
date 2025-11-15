import { Factory } from 'fishery';
import type { Goal } from '@cuewise/shared';
import { getTodayDateString } from '@cuewise/shared';

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
