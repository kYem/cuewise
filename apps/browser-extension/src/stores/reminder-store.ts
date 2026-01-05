import {
  generateId,
  logger,
  type Reminder,
  type ReminderCategory,
  type ReminderFrequency,
} from '@cuewise/shared';
import { getReminders, setReminders } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

interface ReminderStore {
  reminders: Reminder[];
  upcomingReminders: Reminder[];
  overdueReminders: Reminder[];
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  addReminder: (
    text: string,
    dueDate: Date,
    recurring?: { frequency: ReminderFrequency; enabled: boolean },
    category?: ReminderCategory
  ) => Promise<void>;
  toggleReminder: (reminderId: string) => Promise<void>;
  deleteReminder: (reminderId: string) => Promise<void>;
  updateReminder: (reminderId: string, updates: Partial<Omit<Reminder, 'id'>>) => Promise<void>;
  snoozeReminder: (reminderId: string, minutes: number) => Promise<void>;
  markAsNotified: (reminderId: string) => Promise<void>;
  refreshLists: () => void;
}

/**
 * Calculate the next occurrence for a recurring reminder
 */
function calculateNextOccurrence(currentDueDate: Date, frequency: ReminderFrequency): Date {
  const nextDueDate = new Date(currentDueDate);

  switch (frequency) {
    case 'daily':
      nextDueDate.setDate(nextDueDate.getDate() + 1);
      break;
    case 'weekly':
      nextDueDate.setDate(nextDueDate.getDate() + 7);
      break;
    case 'monthly':
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      break;
  }

  return nextDueDate;
}

/**
 * Advance a recurring reminder to the next future occurrence
 * If the reminder is overdue, keep advancing until it's in the future
 */
function advanceToNextFutureOccurrence(reminder: Reminder): Reminder {
  if (!reminder.recurring?.enabled) {
    return reminder;
  }

  const now = new Date();
  let nextDueDate = new Date(reminder.dueDate);

  // Keep advancing until the due date is in the future
  while (nextDueDate <= now) {
    nextDueDate = calculateNextOccurrence(nextDueDate, reminder.recurring.frequency);
  }

  return {
    ...reminder,
    dueDate: nextDueDate.toISOString(),
    completed: false,
    notified: false,
  };
}

/**
 * Filter reminders into upcoming and overdue categories
 */
function categorizeReminders(reminders: Reminder[]) {
  const now = new Date();
  const upcoming: Reminder[] = [];
  const overdue: Reminder[] = [];

  for (const reminder of reminders) {
    if (reminder.completed) continue;

    const dueDate = new Date(reminder.dueDate);
    if (dueDate < now) {
      overdue.push(reminder);
    } else {
      upcoming.push(reminder);
    }
  }

  // Sort upcoming by due date (soonest first)
  upcoming.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Sort overdue by due date (most overdue first)
  overdue.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return { upcoming, overdue };
}

export const useReminderStore = create<ReminderStore>((set, get) => ({
  reminders: [],
  upcomingReminders: [],
  overdueReminders: [],
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      let reminders = await getReminders();

      // Auto-advance overdue recurring reminders to their next future occurrence
      const now = new Date();
      let hasAdvanced = false;
      const advancedReminders = reminders.map((reminder) => {
        // Only advance recurring reminders that are overdue
        if (
          reminder.recurring?.enabled &&
          !reminder.completed &&
          new Date(reminder.dueDate) < now
        ) {
          hasAdvanced = true;
          const advanced = advanceToNextFutureOccurrence(reminder);
          logger.info(`Auto-advanced recurring reminder "${reminder.text}" to ${advanced.dueDate}`);
          return advanced;
        }
        return reminder;
      });

      // Save if any reminders were advanced
      if (hasAdvanced) {
        await setReminders(advancedReminders);
        reminders = advancedReminders;

        // Reschedule alarms for advanced reminders
        if (chrome?.alarms) {
          for (const reminder of reminders) {
            if (reminder.recurring?.enabled) {
              await chrome.alarms.clear(`reminder-${reminder.id}`);
              await chrome.alarms.create(`reminder-${reminder.id}`, {
                when: new Date(reminder.dueDate).getTime(),
              });
            }
          }
        }
      }

      const { upcoming, overdue } = categorizeReminders(reminders);

      set({
        reminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
        isLoading: false,
      });
    } catch (error) {
      logger.error('Error initializing reminder store', error);
      const errorMessage = 'Failed to load reminders. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  addReminder: async (text: string, dueDate: Date, recurring?, category?) => {
    if (!text.trim()) {
      logger.warn('addReminder called with empty text - ignoring request');
      return;
    }

    try {
      const newReminder: Reminder = {
        id: generateId(),
        text: text.trim(),
        dueDate: dueDate.toISOString(),
        completed: false,
        notified: false,
        ...(recurring && { recurring }),
        ...(category && { category }),
      };

      const { reminders } = get();
      const updatedReminders = [...reminders, newReminder];

      await setReminders(updatedReminders);

      const { upcoming, overdue } = categorizeReminders(updatedReminders);
      set({
        reminders: updatedReminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
      });

      // Schedule alarm for this reminder
      if (chrome?.alarms) {
        await chrome.alarms.create(`reminder-${newReminder.id}`, {
          when: dueDate.getTime(),
        });
      }
    } catch (error) {
      logger.error('Error adding reminder', error);
      const errorMessage = 'Failed to add reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  toggleReminder: async (reminderId: string) => {
    try {
      const { reminders } = get();
      const reminder = reminders.find((r) => r.id === reminderId);
      if (!reminder) {
        logger.warn(`toggleReminder: Reminder with id ${reminderId} not found`);
        useToastStore.getState().warning('This reminder no longer exists');
        return;
      }

      const isCompleting = !reminder.completed;

      // For recurring reminders, advance to next occurrence instead of marking complete
      if (isCompleting && reminder.recurring?.enabled) {
        // Always calculate the next occurrence from current due date
        const currentDueDate = new Date(reminder.dueDate);
        const nextDueDate = calculateNextOccurrence(currentDueDate, reminder.recurring.frequency);

        const advancedReminder: Reminder = {
          ...reminder,
          dueDate: nextDueDate.toISOString(),
          completed: false,
          notified: false,
        };

        const updatedReminders = reminders.map((r) => (r.id === reminderId ? advancedReminder : r));

        await setReminders(updatedReminders);

        const { upcoming, overdue } = categorizeReminders(updatedReminders);
        set({
          reminders: updatedReminders,
          upcomingReminders: upcoming,
          overdueReminders: overdue,
        });

        // Reschedule alarm for next occurrence
        if (chrome?.alarms) {
          await chrome.alarms.clear(`reminder-${reminderId}`);
          await chrome.alarms.create(`reminder-${reminderId}`, {
            when: new Date(advancedReminder.dueDate).getTime(),
          });
        }

        useToastStore.getState().success('Recurring reminder advanced to next occurrence');
        return;
      }

      // For non-recurring reminders, toggle completed status
      const updatedReminders = reminders.map((r) =>
        r.id === reminderId
          ? {
              ...r,
              completed: isCompleting,
              // Track when the reminder was completed for context-aware suggestions
              completedAt: isCompleting ? new Date().toISOString() : undefined,
            }
          : r
      );

      await setReminders(updatedReminders);

      const { upcoming, overdue } = categorizeReminders(updatedReminders);
      set({
        reminders: updatedReminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
      });

      // Cancel alarm if completed
      if (isCompleting && chrome?.alarms) {
        await chrome.alarms.clear(`reminder-${reminderId}`);
      }
    } catch (error) {
      logger.error('Error toggling reminder', error);
      const errorMessage = 'Failed to update reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  deleteReminder: async (reminderId: string) => {
    try {
      const { reminders } = get();

      const reminderExists = reminders.some((r) => r.id === reminderId);
      if (!reminderExists) {
        logger.warn(`deleteReminder: Reminder with id ${reminderId} not found`);
        return;
      }

      const updatedReminders = reminders.filter((reminder) => reminder.id !== reminderId);

      await setReminders(updatedReminders);

      const { upcoming, overdue } = categorizeReminders(updatedReminders);
      set({
        reminders: updatedReminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
      });

      // Cancel alarm
      if (chrome?.alarms) {
        await chrome.alarms.clear(`reminder-${reminderId}`);
      }
    } catch (error) {
      logger.error('Error deleting reminder', error);
      const errorMessage = 'Failed to delete reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateReminder: async (reminderId: string, updates: Partial<Omit<Reminder, 'id'>>) => {
    try {
      const { reminders } = get();

      const reminderExists = reminders.some((r) => r.id === reminderId);
      if (!reminderExists) {
        logger.warn(`updateReminder: Reminder with id ${reminderId} not found`);
        useToastStore.getState().warning('This reminder no longer exists');
        return;
      }

      const updatedReminders = reminders.map((reminder) =>
        reminder.id === reminderId ? { ...reminder, ...updates } : reminder
      );

      await setReminders(updatedReminders);

      const { upcoming, overdue } = categorizeReminders(updatedReminders);
      set({
        reminders: updatedReminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
      });

      // Update alarm if dueDate changed
      if (updates.dueDate && chrome?.alarms) {
        await chrome.alarms.clear(`reminder-${reminderId}`);
        await chrome.alarms.create(`reminder-${reminderId}`, {
          when: new Date(updates.dueDate).getTime(),
        });
      }
    } catch (error) {
      logger.error('Error updating reminder', error);
      const errorMessage = 'Failed to update reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  snoozeReminder: async (reminderId: string, minutes: number) => {
    try {
      const { reminders } = get();
      const reminder = reminders.find((r) => r.id === reminderId);

      if (!reminder) {
        logger.warn(`snoozeReminder: Reminder with id ${reminderId} not found`);
        useToastStore.getState().warning('This reminder no longer exists');
        return;
      }

      // Calculate new due date
      const currentDueDate = new Date(reminder.dueDate);
      const newDueDate = new Date(currentDueDate.getTime() + minutes * 60 * 1000);

      // Update reminder with new due date
      const updatedReminders = reminders.map((r) =>
        r.id === reminderId ? { ...r, dueDate: newDueDate.toISOString(), notified: false } : r
      );

      await setReminders(updatedReminders);

      const { upcoming, overdue } = categorizeReminders(updatedReminders);
      set({
        reminders: updatedReminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
      });

      // Update alarm
      if (chrome?.alarms) {
        await chrome.alarms.clear(`reminder-${reminderId}`);
        await chrome.alarms.create(`reminder-${reminderId}`, {
          when: newDueDate.getTime(),
        });
      }
    } catch (error) {
      logger.error('Error snoozing reminder', error);
      const errorMessage = 'Failed to snooze reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  markAsNotified: async (reminderId: string) => {
    try {
      const { reminders } = get();

      const updatedReminders = reminders.map((reminder) =>
        reminder.id === reminderId ? { ...reminder, notified: true } : reminder
      );

      await setReminders(updatedReminders);

      set({ reminders: updatedReminders });
    } catch (error) {
      logger.error('Error marking reminder as notified', error);
      // Track error in state for debugging, but don't show toast since this is a background operation
      set({ error: 'Failed to update notification status' });
    }
  },

  refreshLists: () => {
    const { reminders } = get();
    const { upcoming, overdue } = categorizeReminders(reminders);
    set({ upcomingReminders: upcoming, overdueReminders: overdue });
  },
}));
