import {
  generateId,
  getNotifier,
  getScheduler,
  isUpcomingRecurringOccurrence,
  logger,
  nextReminderDueDate,
  notifyDeleted,
  notifyMutated,
  type Reminder,
  type ReminderCategory,
  type ReminderRecurrence,
  reminderAlarmId,
  skipReminderOccurrence,
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
    recurring?: ReminderRecurrence,
    category?: ReminderCategory
  ) => Promise<boolean>;
  toggleReminder: (reminderId: string) => Promise<void>;
  deleteReminder: (reminderId: string) => Promise<void>;
  updateReminder: (reminderId: string, updates: Partial<Omit<Reminder, 'id'>>) => Promise<boolean>;
  snoozeReminder: (reminderId: string, minutes: number) => Promise<void>;
  setReminderPaused: (reminderId: string, paused: boolean) => Promise<void>;
  markAsNotified: (reminderId: string) => Promise<void>;
  fireDueReminders: () => Promise<void>;
  refreshLists: () => void;
}

// Alarm scheduling is best-effort: the reminder is already saved, so a failure
// (e.g. Chrome's alarm rate limit) must not revert it — log, and warn distinctly.
async function clearReminderAlarm(reminderId: string): Promise<void> {
  try {
    await getScheduler().cancel(reminderAlarmId(reminderId));
  } catch (error) {
    logger.error(`Failed to clear alarm for reminder ${reminderId}`, error);
  }
}

async function armReminderAlarm(reminderId: string, whenMs: number): Promise<void> {
  try {
    await getScheduler().scheduleAt(reminderAlarmId(reminderId), new Date(whenMs));
  } catch (error) {
    logger.error(`Failed to schedule alarm for reminder ${reminderId}`, error);
    useToastStore.getState().warning("Reminder saved, but we couldn't schedule its alert.");
  }
}

/**
 * Filter reminders into upcoming and overdue categories
 */
function categorizeReminders(reminders: Reminder[]) {
  const now = new Date();
  const upcoming: Reminder[] = [];
  const overdue: Reminder[] = [];

  for (const reminder of reminders) {
    if (reminder.completed) {
      continue;
    }

    // A paused recurring reminder can never fire, so it's never overdue.
    if (reminder.paused) {
      upcoming.push(reminder);
      continue;
    }

    const dueDate = new Date(reminder.dueDate);
    if (dueDate < now) {
      overdue.push(reminder);
    } else {
      upcoming.push(reminder);
    }
  }

  // Sort upcoming by due date (soonest first), but rank paused reminders last —
  // their frozen dueDate must not displace active reminders from priority slots.
  upcoming.sort((a, b) => {
    const aPaused = a.paused === true;
    const bPaused = b.paused === true;
    if (aPaused !== bPaused) {
      return aPaused ? 1 : -1;
    }
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  // Sort overdue by due date (most overdue first)
  overdue.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return { upcoming, overdue };
}

/** Recategorize reminders into upcoming/overdue and commit them (plus any extra state). */
function commitReminders(
  set: (partial: Partial<ReminderStore>) => void,
  reminders: Reminder[],
  extra?: Partial<ReminderStore>
): void {
  const { upcoming, overdue } = categorizeReminders(reminders);
  set({ reminders, upcomingReminders: upcoming, overdueReminders: overdue, ...extra });
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
        // Only advance ACTIVE recurring reminders that are overdue
        if (
          reminder.recurring != null &&
          !reminder.paused &&
          !reminder.completed &&
          new Date(reminder.dueDate) < now
        ) {
          hasAdvanced = true;
          const nextDueDate = nextReminderDueDate(reminder, now);
          const advanced: Reminder = {
            ...reminder,
            dueDate: nextDueDate.toISOString(),
            completed: false,
            notified: false,
          };
          logger.info(`Auto-advanced recurring reminder "${reminder.text}" to ${advanced.dueDate}`);
          return advanced;
        }
        return reminder;
      });

      // Save if any reminders were advanced; only adopt the advanced list and
      // reschedule alarms when the write actually persisted, else fall back to the
      // original list so the panel still loads with un-advanced (stale) reminders.
      if (hasAdvanced) {
        const result = await setReminders(advancedReminders);
        if (result?.success === false) {
          logger.error('Failed to persist auto-advanced reminders on init', result.error);
        } else {
          reminders = advancedReminders;

          // Reschedule alarms for advanced reminders
          for (const reminder of reminders) {
            if (reminder.recurring && !reminder.paused) {
              await clearReminderAlarm(reminder.id);
              await armReminderAlarm(reminder.id, new Date(reminder.dueDate).getTime());
            }
          }
        }
      }

      commitReminders(set, reminders, { isLoading: false });

      // Rust-backed schedulers lose their armed wakes on restart (unlike
      // chrome.alarms), so re-arm every active reminder from storage. Overdue
      // one-offs fire on arm; skip ones already delivered so they don't re-notify.
      const scheduler = getScheduler();
      if (scheduler.deliversInBackground && !scheduler.persistsAcrossRestarts) {
        for (const reminder of reminders) {
          if (reminder.completed || reminder.paused) {
            continue;
          }
          if (!reminder.recurring && reminder.notified) {
            continue;
          }
          await armReminderAlarm(reminder.id, new Date(reminder.dueDate).getTime());
        }
      }
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
      return false;
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

      // Honor the persist result before committing state or arming an alarm: a
      // failed write resolves {success:false} instead of throwing.
      const result = await setReminders(updatedReminders);
      if (result?.success === false) {
        logger.error('Failed to persist new reminder', result.error);
        const errorMessage = 'Failed to add reminder. Please try again.';
        set({ error: errorMessage });
        useToastStore.getState().error(errorMessage);
        return false;
      }

      commitReminders(set, updatedReminders);
      notifyMutated('reminders', newReminder.id);

      // Schedule alarm for this reminder
      await armReminderAlarm(newReminder.id, dueDate.getTime());

      return true;
    } catch (error) {
      logger.error('Error adding reminder', error);
      const errorMessage = 'Failed to add reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
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

      // Any recurring reminder (active OR paused) advances to its next occurrence
      // instead of being marked complete, which would permanently destroy it.
      if (isCompleting && reminder.recurring) {
        const now = new Date();
        // A not-yet-due occurrence is skipped to the one after it (calendar reminders keep
        // their clock time, e.g. tonight 9pm → tomorrow 9pm); a due/overdue one restarts
        // its cadence from now.
        const nextDueDate = isUpcomingRecurringOccurrence(reminder, now)
          ? skipReminderOccurrence(reminder)
          : nextReminderDueDate(reminder, now);

        // The full spread preserves paused/recurring, so a paused reminder stays paused.
        const advancedReminder: Reminder = {
          ...reminder,
          dueDate: nextDueDate.toISOString(),
          completed: false,
          notified: false,
        };

        const updatedReminders = reminders.map((r) => (r.id === reminderId ? advancedReminder : r));

        // Bail before committing state, arming an alarm, or toasting success on a failed write.
        const result = await setReminders(updatedReminders);
        if (result?.success === false) {
          logger.error('Failed to persist advanced recurring reminder', result.error);
          useToastStore.getState().error('Failed to update reminder. Please try again.');
          return;
        }

        commitReminders(set, updatedReminders);
        notifyMutated('reminders', reminderId);

        // Only (re)arm an alarm when the reminder is active; a paused one must not fire.
        await clearReminderAlarm(reminderId);
        if (!reminder.paused) {
          await armReminderAlarm(reminderId, new Date(advancedReminder.dueDate).getTime());
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

      // Bail before committing state or clearing the alarm on a failed write.
      const result = await setReminders(updatedReminders);
      if (result?.success === false) {
        logger.error('Failed to persist reminder toggle', result.error);
        useToastStore.getState().error('Failed to update reminder. Please try again.');
        return;
      }

      commitReminders(set, updatedReminders);
      notifyMutated('reminders', reminderId);

      // Cancel alarm if completed
      if (isCompleting) {
        await clearReminderAlarm(reminderId);
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

      // Bail before committing state or clearing the alarm on a failed write.
      const result = await setReminders(updatedReminders);
      if (result?.success === false) {
        logger.error('Failed to persist reminder deletion', result.error);
        useToastStore.getState().error('Failed to delete reminder. Please try again.');
        return;
      }

      commitReminders(set, updatedReminders);
      notifyDeleted('reminders', reminderId);

      // Cancel alarm
      await clearReminderAlarm(reminderId);
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
        return false;
      }

      const updatedReminders = reminders.map((reminder) =>
        reminder.id === reminderId ? { ...reminder, ...updates } : reminder
      );

      // Honor the persist result before committing state or updating the alarm.
      const result = await setReminders(updatedReminders);
      if (result?.success === false) {
        logger.error('Failed to persist reminder update', result.error);
        const errorMessage = 'Failed to update reminder. Please try again.';
        set({ error: errorMessage });
        useToastStore.getState().error(errorMessage);
        return false;
      }

      commitReminders(set, updatedReminders);
      notifyMutated('reminders', reminderId);

      // Update alarm if dueDate changed
      if (updates.dueDate) {
        await clearReminderAlarm(reminderId);
        // Don't re-arm a paused reminder; editing it must leave it silent.
        const updatedReminder = updatedReminders.find((r) => r.id === reminderId);
        if (!updatedReminder?.paused) {
          await armReminderAlarm(reminderId, new Date(updates.dueDate).getTime());
        }
      }

      return true;
    } catch (error) {
      logger.error('Error updating reminder', error);
      const errorMessage = 'Failed to update reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
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

      // Snooze reschedules to N minutes from NOW, not from the (possibly past)
      // due date — otherwise snoozing an overdue reminder leaves it in the past.
      const newDueDate = new Date(Date.now() + minutes * 60 * 1000);

      // Update reminder with new due date
      const updatedReminders = reminders.map((r) =>
        r.id === reminderId ? { ...r, dueDate: newDueDate.toISOString(), notified: false } : r
      );

      // Bail before committing state or rescheduling the alarm on a failed write.
      const result = await setReminders(updatedReminders);
      if (result?.success === false) {
        logger.error('Failed to persist reminder snooze', result.error);
        useToastStore.getState().error('Failed to snooze reminder. Please try again.');
        return;
      }

      commitReminders(set, updatedReminders);
      notifyMutated('reminders', reminderId);

      // Update alarm
      await clearReminderAlarm(reminderId);
      await armReminderAlarm(reminderId, newDueDate.getTime());
    } catch (error) {
      logger.error('Error snoozing reminder', error);
      const errorMessage = 'Failed to snooze reminder. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  setReminderPaused: async (reminderId: string, paused: boolean) => {
    try {
      const { reminders } = get();
      const reminder = reminders.find((r) => r.id === reminderId);
      if (!reminder || !reminder.recurring) {
        return;
      }

      // On resume, advance dueDate to the next occurrence so it isn't stale/overdue.
      const resumedDueDate = paused
        ? reminder.dueDate
        : nextReminderDueDate(reminder, new Date()).toISOString();

      const updated = reminders.map((r) =>
        r.id === reminderId && r.recurring ? { ...r, dueDate: resumedDueDate, paused } : r
      );

      // Bail before committing state or touching the alarm on a failed write.
      const result = await setReminders(updated);
      if (result?.success === false) {
        logger.error('Failed to persist reminder pause state', result.error);
        useToastStore.getState().error('Failed to update reminder. Please try again.');
        return;
      }

      commitReminders(set, updated);
      notifyMutated('reminders', reminderId);

      if (paused) {
        await clearReminderAlarm(reminderId);
      } else {
        await armReminderAlarm(reminderId, new Date(resumedDueDate).getTime());
      }
    } catch (error) {
      logger.error('Error pausing reminder', error);
      useToastStore.getState().error('Failed to update reminder. Please try again.');
    }
  },

  markAsNotified: async (reminderId: string) => {
    try {
      const { reminders } = get();

      const updatedReminders = reminders.map((reminder) =>
        reminder.id === reminderId ? { ...reminder, notified: true } : reminder
      );

      // Bail before committing state on a failed write so notified stays consistent with storage.
      const result = await setReminders(updatedReminders);
      if (result?.success === false) {
        logger.error('Failed to persist notified status', result.error);
        set({ error: 'Failed to update notification status' });
        return;
      }

      set({ reminders: updatedReminders });
    } catch (error) {
      logger.error('Error marking reminder as notified', error);
      // Track error in state for debugging, but don't show toast since this is a background operation
      set({ error: 'Failed to update notification status' });
    }
  },

  // Fallback for platforms without chrome.alarms: mark newly-due reminders as
  // notified so they surface in the panel. The alarm path owns recurrence rescheduling.
  fireDueReminders: async () => {
    try {
      const { reminders } = get();
      const now = new Date();

      const dueNow = reminders.filter(
        (r) =>
          !r.completed && r.paused !== true && r.notified !== true && new Date(r.dueDate) <= now
      );

      if (dueNow.length === 0) {
        return;
      }

      const firedIds = new Set(dueNow.map((r) => r.id));
      const updated = reminders.map((r) => (firedIds.has(r.id) ? { ...r, notified: true } : r));

      // Bail on a failed write WITHOUT toasting: notified was never saved, so the next
      // poll would re-fire and storm duplicate toasts every interval.
      const result = await setReminders(updated);
      if (result?.success === false) {
        logger.error('Failed to persist fired reminders', result.error);
        return;
      }

      commitReminders(set, updated);

      for (const r of dueNow) {
        useToastStore.getState().warning(`Reminder: ${r.text}`);
        // With no background worker to raise the OS notification (web / a native
        // app whose scheduler doesn't deliver in the background), deliver it here
        // via the port. Where a resident host owns delivery, it notifies instead.
        if (!getScheduler().deliversInBackground) {
          getNotifier()
            .notify({
              id: reminderAlarmId(r.id),
              title: '🔔 Reminder',
              body: r.text,
              actions: ['Done', 'Snooze 5 min'],
              requireInteraction: true,
            })
            .catch((error) => logger.error('Failed to deliver reminder notification', error));
        }
      }
    } catch (error) {
      logger.error('Error firing due reminders', error);
    }
  },

  refreshLists: () => {
    const { reminders } = get();
    commitReminders(set, reminders);
  },
}));
