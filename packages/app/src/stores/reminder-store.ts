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
  STORAGE_KEYS,
  skipReminderOccurrence,
} from '@cuewise/shared';
import {
  getReminders,
  getReminders as loadAllReminders,
  setReminders as saveAllReminders,
  updateReminders,
  withCollectionLock,
} from '@cuewise/storage';
import { create } from 'zustand';
import { createStaleLatch, createStorageObserver, sameEntities } from './storage-changes';
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

const STALE_REMINDERS_MESSAGE =
  "Cuewise couldn't re-read your reminders just now, so what you see may be out of date.";

/**
 * Known gap: a pulled reminder is shown but not armed — the re-arm loop below is skipped where the
 * scheduler persists its own wakes, so a pulled one-off waits for a local edit.
 */
const remindersObserver = createStorageObserver(
  'reminders',
  [STORAGE_KEYS.REMINDERS],
  async () => {
    const reminders = await getReminders();
    if (sameEntities(useReminderStore.getState().reminders, reminders)) {
      return;
    }
    commitReminders((partial) => useReminderStore.setState(partial), reminders);
  },
  createStaleLatch((message) => useToastStore.getState().warning(message), STALE_REMINDERS_MESSAGE)
);

export const useReminderStore = create<ReminderStore>((set, get) => ({
  reminders: [],
  upcomingReminders: [],
  overdueReminders: [],
  isLoading: true,
  error: null,

  initialize: async () => {
    // Before the read: a pull landing during it is otherwise announced to nobody, and the
    // auto-advance write below would persist the pre-pull snapshot over it.
    remindersObserver.subscribe();
    try {
      set({ isLoading: true, error: null });

      let reminders = await getReminders();

      // Auto-advance overdue recurring reminders to their next future occurrence
      const now = new Date();
      const isOverdueRecurring = (reminder: Reminder): boolean =>
        reminder.recurring != null &&
        !reminder.paused &&
        !reminder.completed &&
        new Date(reminder.dueDate) < now;
      const advance = (list: Reminder[]): Reminder[] =>
        list.map((reminder) => {
          if (!isOverdueRecurring(reminder)) {
            return reminder;
          }
          const nextDueDate = nextReminderDueDate(reminder, now);
          const advanced: Reminder = {
            ...reminder,
            dueDate: nextDueDate.toISOString(),
            completed: false,
            notified: false,
          };
          logger.info(`Auto-advanced recurring reminder "${reminder.text}" to ${advanced.dueDate}`);
          return advanced;
        });

      // Re-runs against a fresh read inside the lock, so a pull landing during the read survives.
      if (reminders.some(isOverdueRecurring)) {
        const { result, reminders: advancedReminders } = await updateReminders(advance);
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

      // Rust-backed schedulers lose their armed wakes on restart, unlike chrome.alarms, so re-arm
      // from storage. Overdue one-offs fire on arm; skip delivered ones so they don't re-notify.
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
    // Awaited and last: ReminderWidget chains fireDueReminders off this, and that writes the
    // whole array from the in-memory copy — it must not run against pre-reconcile state.
    await remindersObserver.reconcile();
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

      // Honor the persist result before committing state or arming an alarm: a
      // failed write resolves {success:false} instead of throwing.
      const { result, reminders: updatedReminders } = await updateReminders((current) => [
        ...current,
        newReminder,
      ]);
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
      const now = new Date();
      // Recurrence is decided off the fresh entity: a pull can add or drop it while this waits,
      // and branching on the snapshot then completes a series, or no-ops while killing its alarm.
      const done: { outcome: 'advanced' | 'toggled' | 'absent'; written: Reminder | null } = {
        outcome: 'absent',
        written: null,
      };

      // Bail before committing state, arming an alarm, or toasting success on a failed write.
      const { result, reminders: updatedReminders } = await updateReminders((current) =>
        current.map((r) => {
          if (r.id !== reminderId) {
            return r;
          }
          // Any recurring reminder (active OR paused) advances to its next occurrence
          // instead of being marked complete, which would permanently destroy it.
          if (isCompleting && r.recurring) {
            // A not-yet-due occurrence is skipped to the one after it, keeping its clock time
            // (tonight 9pm → tomorrow 9pm); a due/overdue one restarts its cadence from now.
            const nextDueDate = isUpcomingRecurringOccurrence(r, now)
              ? skipReminderOccurrence(r)
              : nextReminderDueDate(r, now);
            // The full spread preserves paused/recurring, so a paused reminder stays paused.
            done.outcome = 'advanced';
            done.written = {
              ...r,
              dueDate: nextDueDate.toISOString(),
              completed: false,
              notified: false,
            };
            return done.written;
          }
          done.outcome = 'toggled';
          done.written = {
            ...r,
            completed: isCompleting,
            // Track when the reminder was completed for context-aware suggestions
            completedAt: isCompleting ? now.toISOString() : undefined,
          };
          return done.written;
        })
      );
      if (result?.success === false) {
        logger.error('Failed to persist reminder toggle', result.error);
        useToastStore.getState().error('Failed to update reminder. Please try again.');
        return;
      }
      // A pull deleted it while the lock was held: nothing was written, so touching its alarm
      // or claiming success would both be lies.
      if (done.outcome === 'absent' || done.written === null) {
        logger.warn(`toggleReminder: Reminder with id ${reminderId} was removed before the write`);
        useToastStore.getState().warning('This reminder no longer exists');
        return;
      }

      commitReminders(set, updatedReminders);
      notifyMutated('reminders', reminderId);

      if (done.outcome === 'advanced') {
        // Only (re)arm an alarm when the reminder is active; a paused one must not fire.
        await clearReminderAlarm(reminderId);
        if (!done.written.paused) {
          await armReminderAlarm(reminderId, new Date(done.written.dueDate).getTime());
        }
        useToastStore.getState().success('Recurring reminder advanced to next occurrence');
        return;
      }

      // Cancel alarm if completed
      if (done.written.completed) {
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

      // Bail before committing state or clearing the alarm on a failed write.
      const { result, reminders: updatedReminders } = await updateReminders((current) =>
        current.filter((reminder) => reminder.id !== reminderId)
      );
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

      // Honor the persist result before committing state or updating the alarm.
      const { result, reminders: updatedReminders } = await updateReminders((current) =>
        current.map((reminder) =>
          reminder.id === reminderId ? { ...reminder, ...updates } : reminder
        )
      );
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
        // Don't re-arm a paused reminder, or one a pull deleted while the lock was held.
        const updatedReminder = updatedReminders.find((r) => r.id === reminderId);
        if (updatedReminder !== undefined && !updatedReminder.paused) {
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

      // Bail before committing state or rescheduling the alarm on a failed write.
      const { result, reminders: updatedReminders } = await updateReminders((current) =>
        current.map((r) =>
          r.id === reminderId ? { ...r, dueDate: newDueDate.toISOString(), notified: false } : r
        )
      );
      if (result?.success === false) {
        logger.error('Failed to persist reminder snooze', result.error);
        useToastStore.getState().error('Failed to snooze reminder. Please try again.');
        return;
      }

      commitReminders(set, updatedReminders);
      notifyMutated('reminders', reminderId);

      // Only touch the alarm for a reminder the write actually found: a pull may have deleted
      // or paused it while this waited on the lock, and arming it then resurrects a dead wake.
      const snoozed = updatedReminders.find((r) => r.id === reminderId);
      if (snoozed !== undefined && snoozed.paused !== true) {
        await clearReminderAlarm(reminderId);
        await armReminderAlarm(reminderId, newDueDate.getTime());
      }
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
      if (!reminder?.recurring) {
        return;
      }

      // Pausing must not touch dueDate: writing the snapshot's copy would revert an occurrence
      // a pull advanced while this was waiting on the lock.
      const applied: { paused: boolean; dueDate: string | null } = { paused: false, dueDate: null };

      // Bail before committing state or touching the alarm on a failed write.
      const { result, reminders: updated } = await updateReminders((current) =>
        current.map((r) => {
          if (r.id !== reminderId || !r.recurring) {
            return r;
          }
          applied.paused = paused;
          if (paused) {
            return { ...r, paused };
          }
          // On resume, advance dueDate to the next occurrence so it isn't stale/overdue.
          applied.dueDate = nextReminderDueDate(r, new Date()).toISOString();
          return { ...r, dueDate: applied.dueDate, paused };
        })
      );
      if (result?.success === false) {
        logger.error('Failed to persist reminder pause state', result.error);
        useToastStore.getState().error('Failed to update reminder. Please try again.');
        return;
      }

      commitReminders(set, updated);
      notifyMutated('reminders', reminderId);

      // Only when the write found it still recurring: cancelling the alarm of a reminder a pull
      // turned into a one-off leaves storage saying active while nothing will ever fire.
      if (applied.dueDate !== null) {
        await armReminderAlarm(reminderId, new Date(applied.dueDate).getTime());
      } else if (applied.paused) {
        await clearReminderAlarm(reminderId);
      }
    } catch (error) {
      logger.error('Error pausing reminder', error);
      useToastStore.getState().error('Failed to update reminder. Please try again.');
    }
  },

  markAsNotified: async (reminderId: string) => {
    try {
      // Bail before committing state on a failed write so notified stays consistent with storage.
      const { result, reminders: updatedReminders } = await updateReminders((current) =>
        current.map((reminder) =>
          reminder.id === reminderId ? { ...reminder, notified: true } : reminder
        )
      );
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
      const now = new Date();
      const isDue = (r: Reminder): boolean =>
        !r.completed && r.paused !== true && r.notified !== true && new Date(r.dueDate) <= now;

      if (!get().reminders.some(isDue)) {
        return;
      }

      // Re-derived inside the lock: stamping notified on a reminder a pull just snoozed silences
      // that occurrence for good. Nothing due means no write at all, since this polls.
      const fired = await withCollectionLock('reminders', async () => {
        const current = await loadAllReminders();
        const dueNow = current.filter(isDue);
        if (dueNow.length === 0) {
          return null;
        }
        const firedIds = new Set(dueNow.map((r) => r.id));
        const next = current.map((r) => (firedIds.has(r.id) ? { ...r, notified: true } : r));
        return { dueNow, reminders: next, result: await saveAllReminders(next) };
      });
      if (fired === null) {
        return;
      }

      // Bail on a failed write WITHOUT toasting: notified was never saved, so the next
      // poll would re-fire and storm duplicate toasts every interval.
      if (fired.result?.success === false) {
        logger.error('Failed to persist fired reminders', fired.result.error);
        return;
      }
      const { dueNow, reminders: updated } = fired;

      commitReminders(set, updated);
      // At error level because that is the shipped default: `notified` is now persisted, so a
      // reminder that fired but never reached the user would otherwise leave no trace.
      logger.error('Fired due reminders', { count: dueNow.length });

      for (const r of dueNow) {
        useToastStore.getState().warning(`Reminder: ${r.text}`);
        // No background worker to raise the OS notification, so deliver it here via the port.
        // Where a resident host owns delivery, it notifies instead.
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
