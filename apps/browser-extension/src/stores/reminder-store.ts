import { generateId, type Reminder } from '@cuewise/shared';
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
    recurring?: { frequency: 'daily' | 'weekly' | 'monthly'; enabled: boolean }
  ) => Promise<void>;
  toggleReminder: (reminderId: string) => Promise<void>;
  deleteReminder: (reminderId: string) => Promise<void>;
  updateReminder: (reminderId: string, updates: Partial<Omit<Reminder, 'id'>>) => Promise<void>;
  snoozeReminder: (reminderId: string, minutes: number) => Promise<void>;
  markAsNotified: (reminderId: string) => Promise<void>;
  refreshLists: () => void;
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

      const reminders = await getReminders();
      const { upcoming, overdue } = categorizeReminders(reminders);

      set({
        reminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error initializing reminder store:', error);
      const errorMessage = 'Failed to load reminders. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  addReminder: async (text: string, dueDate: Date, recurring?) => {
    if (!text.trim()) return;

    try {
      const newReminder: Reminder = {
        id: generateId(),
        text: text.trim(),
        dueDate: dueDate.toISOString(),
        completed: false,
        notified: false,
        ...(recurring && { recurring }),
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
      console.error('Error adding reminder:', error);
      const errorMessage = 'Failed to add reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  toggleReminder: async (reminderId: string) => {
    try {
      const { reminders } = get();

      const updatedReminders = reminders.map((reminder) =>
        reminder.id === reminderId ? { ...reminder, completed: !reminder.completed } : reminder
      );

      await setReminders(updatedReminders);

      const { upcoming, overdue } = categorizeReminders(updatedReminders);
      set({
        reminders: updatedReminders,
        upcomingReminders: upcoming,
        overdueReminders: overdue,
      });

      // Cancel alarm if completed
      const reminder = reminders.find((r) => r.id === reminderId);
      if (reminder && !reminder.completed && chrome?.alarms) {
        await chrome.alarms.clear(`reminder-${reminderId}`);
      }
    } catch (error) {
      console.error('Error toggling reminder:', error);
      const errorMessage = 'Failed to update reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  deleteReminder: async (reminderId: string) => {
    try {
      const { reminders } = get();

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
      console.error('Error deleting reminder:', error);
      const errorMessage = 'Failed to delete reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateReminder: async (reminderId: string, updates: Partial<Omit<Reminder, 'id'>>) => {
    try {
      const { reminders } = get();

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
      console.error('Error updating reminder:', error);
      const errorMessage = 'Failed to update reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  snoozeReminder: async (reminderId: string, minutes: number) => {
    try {
      const { reminders } = get();
      const reminder = reminders.find((r) => r.id === reminderId);

      if (!reminder) return;

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
      console.error('Error snoozing reminder:', error);
      set({ error: 'Failed to snooze reminder' });
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
      console.error('Error marking reminder as notified:', error);
    }
  },

  refreshLists: () => {
    const { reminders } = get();
    const { upcoming, overdue } = categorizeReminders(reminders);
    set({ upcomingReminders: upcoming, overdueReminders: overdue });
  },
}));
