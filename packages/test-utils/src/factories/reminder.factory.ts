import { Factory } from 'fishery';
import type { Reminder } from '@cuewise/shared';

export const reminderFactory = Factory.define<Reminder>(({ sequence }) => ({
  id: `reminder-${sequence}`,
  text: `Test reminder ${sequence}`,
  dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
  completed: false,
  notified: false,
  recurring: undefined,
}));

export const recurringReminderFactory = reminderFactory.params({
  recurring: {
    frequency: 'daily' as const,
    enabled: true,
  },
});

export const completedReminderFactory = reminderFactory.params({
  completed: true,
});
