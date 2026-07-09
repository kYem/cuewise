import { configurePlatform } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from './reminder-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getReminders: vi.fn(),
  setReminders: vi.fn(),
}));

// Mock toast store with module-level fns so each level is inspectable across getState() calls.
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastSuccess = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: toastError,
      warning: toastWarning,
      success: toastSuccess,
    }),
  },
}));

const getRemindersMock = vi.mocked(storage.getReminders);
const setRemindersMock = vi.mocked(storage.setReminders);

// The Scheduler is injected; assert against it instead of poking chrome.alarms.
const fakeScheduler = {
  deliversInBackground: false,
  persistsAcrossRestarts: false,
  scheduleAt: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.clearAllMocks();
  getRemindersMock.mockResolvedValue([]);
  setRemindersMock.mockResolvedValue({ success: true });
  configurePlatform({ scheduler: fakeScheduler });
  useReminderStore.setState({
    reminders: [],
    upcomingReminders: [],
    overdueReminders: [],
    isLoading: false,
    error: null,
  });
});

describe('setReminderPaused', () => {
  it('pauses the reminder and clears the alarm when pausing', async () => {
    const store = useReminderStore.getState();
    await store.addReminder('Move', new Date(Date.now() + 60_000), {
      frequency: 'interval',
      intervalMinutes: 30,
    });
    const id = useReminderStore.getState().reminders[0].id;

    await useReminderStore.getState().setReminderPaused(id, true);

    expect(useReminderStore.getState().reminders[0].paused).toBe(true);
    expect(fakeScheduler.cancel).toHaveBeenCalledWith(`reminder-${id}`);
  });

  it('unpauses the reminder and recreates the alarm when resuming', async () => {
    const store = useReminderStore.getState();
    await store.addReminder('Move', new Date(Date.now() + 60_000), {
      frequency: 'interval',
      intervalMinutes: 30,
    });
    const id = useReminderStore.getState().reminders[0].id;
    await useReminderStore.getState().setReminderPaused(id, true);
    fakeScheduler.scheduleAt.mockClear();

    const beforeResume = Date.now();
    await useReminderStore.getState().setReminderPaused(id, false);

    const resumed = useReminderStore.getState().reminders[0];
    expect(resumed.paused).toBe(false);
    // Resume advances dueDate to the next occurrence (now + interval), not a stale past time.
    expect(new Date(resumed.dueDate).getTime()).toBeGreaterThan(beforeResume);
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith(`reminder-${id}`, expect.any(Date));
  });
});

describe('toggleReminder on a paused recurring reminder', () => {
  const pausedReminder = recurringReminderFactory.build({
    id: 'paused-1',
    text: 'Move',
    dueDate: new Date(Date.now() - 60_000).toISOString(),
    recurring: { frequency: 'interval', intervalMinutes: 30 },
    paused: true,
  });

  it('advances the due date and stays paused without completing or arming an alarm', async () => {
    useReminderStore.setState({ reminders: [pausedReminder] });
    const before = Date.now();

    await useReminderStore.getState().toggleReminder('paused-1');

    const updated = useReminderStore.getState().reminders[0];
    expect(updated.completed).toBe(false);
    expect(updated.paused).toBe(true);
    // Advanced to the next occurrence (now + interval), no longer in the past.
    expect(new Date(updated.dueDate).getTime()).toBeGreaterThan(before);
    expect(fakeScheduler.scheduleAt).not.toHaveBeenCalled();
  });
});

describe('toggleReminder on a future recurring reminder', () => {
  it('skips the upcoming interval occurrence (dueDate + cadence, not now + cadence)', async () => {
    const reminder = recurringReminderFactory.build({
      id: 'future-interval',
      text: 'Move',
      dueDate: new Date(Date.now() + 30 * 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    const dueTime = new Date(reminder.dueDate).getTime();
    useReminderStore.setState({ reminders: [reminder] });

    await useReminderStore.getState().toggleReminder('future-interval');

    const updated = useReminderStore.getState().reminders[0];
    // Deterministic: skip anchors to the scheduled dueDate, not to "now".
    expect(new Date(updated.dueDate).getTime()).toBe(dueTime + 30 * 60_000);
    expect(updated.completed).toBe(false);
    // The alarm is re-armed at the skipped occurrence (clear then create).
    expect(fakeScheduler.cancel).toHaveBeenCalledWith('reminder-future-interval');
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith(
      'reminder-future-interval',
      new Date(dueTime + 30 * 60_000)
    );
  });

  it('advances a future daily occurrence one day keeping the clock time', async () => {
    const reminder = recurringReminderFactory.build({
      id: 'future-daily',
      text: 'Stand up',
      dueDate: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      recurring: { frequency: 'daily' },
    });
    const dueDate = new Date(reminder.dueDate);
    const dueTime = dueDate.getTime();
    useReminderStore.setState({ reminders: [reminder] });

    await useReminderStore.getState().toggleReminder('future-daily');

    const updated = new Date(useReminderStore.getState().reminders[0].dueDate);
    expect(updated.getHours()).toBe(dueDate.getHours());
    expect(updated.getMinutes()).toBe(dueDate.getMinutes());
    // ~24h later; DST-safe bounds.
    expect(updated.getTime()).toBeGreaterThan(dueTime + 23 * 60 * 60_000);
    expect(updated.getTime()).toBeLessThan(dueTime + 25 * 60 * 60_000);
  });
});

describe('categorizeReminders with a paused reminder', () => {
  const pausedPastReminder = recurringReminderFactory.build({
    id: 'paused-2',
    text: 'Stretch',
    dueDate: new Date(Date.now() - 60_000).toISOString(),
    recurring: { frequency: 'interval', intervalMinutes: 30 },
    paused: true,
  });

  it('places a paused reminder with a past due date in upcoming, not overdue', () => {
    useReminderStore.setState({ reminders: [pausedPastReminder] });

    useReminderStore.getState().refreshLists();

    const { upcomingReminders, overdueReminders } = useReminderStore.getState();
    expect(upcomingReminders).toHaveLength(1);
    expect(upcomingReminders[0].id).toBe('paused-2');
    expect(overdueReminders).toHaveLength(0);
  });

  it('ranks a paused reminder after active ones despite an earlier due date', () => {
    const activeUpcoming = recurringReminderFactory.build({
      id: 'active-1',
      text: 'Move',
      dueDate: new Date(Date.now() + 30 * 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    useReminderStore.setState({ reminders: [pausedPastReminder, activeUpcoming] });

    useReminderStore.getState().refreshLists();

    const { upcomingReminders } = useReminderStore.getState();
    expect(upcomingReminders.map((r) => r.id)).toEqual(['active-1', 'paused-2']);
  });
});

describe('updateReminder dropping recurrence', () => {
  it('clears the paused flag and re-arms when a paused recurring reminder becomes a one-off', async () => {
    const paused = recurringReminderFactory.build({
      id: 'r-edit',
      text: 'Move',
      dueDate: new Date(Date.now() + 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
      paused: true,
    });
    useReminderStore.setState({ reminders: [paused] });

    await useReminderStore.getState().updateReminder('r-edit', {
      dueDate: new Date(Date.now() + 3_600_000).toISOString(),
      recurring: undefined,
      paused: undefined,
    });

    const updated = useReminderStore.getState().reminders[0];
    expect(updated.recurring).toBeUndefined();
    expect(updated.paused).toBeFalsy();
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith('reminder-r-edit', expect.any(Date));
  });
});

describe('initialize with a paused reminder', () => {
  it('skips paused reminders: no advance, no alarm', async () => {
    const pastDueDate = new Date(Date.now() - 60_000).toISOString();
    const pausedPast = recurringReminderFactory.build({
      id: 'paused-init',
      text: 'Move',
      dueDate: pastDueDate,
      recurring: { frequency: 'interval', intervalMinutes: 30 },
      paused: true,
    });
    getRemindersMock.mockResolvedValue([pausedPast]);

    await useReminderStore.getState().initialize();

    const reminder = useReminderStore.getState().reminders[0];
    expect(reminder.paused).toBe(true);
    // Frozen: a paused reminder must not auto-advance on init.
    expect(reminder.dueDate).toBe(pastDueDate);
    expect(fakeScheduler.scheduleAt).not.toHaveBeenCalledWith(
      'reminder-paused-init',
      expect.any(Date)
    );
  });
});

describe('updateReminder keeping recurrence', () => {
  it('keeps paused when only the text is edited', async () => {
    const paused = recurringReminderFactory.build({
      id: 'r-keep',
      text: 'Move',
      dueDate: new Date(Date.now() + 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
      paused: true,
    });
    useReminderStore.setState({ reminders: [paused] });

    await useReminderStore.getState().updateReminder('r-keep', { text: 'New text' });

    const updated = useReminderStore.getState().reminders[0];
    expect(updated.paused).toBe(true);
    expect(updated.recurring).toBeDefined();
  });
});

describe('fireDueReminders', () => {
  it('marks past-due active reminders as notified while leaving future ones untouched', async () => {
    const due = reminderFactory.build({
      id: 'due-1',
      text: 'Stand up',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
      notified: false,
    });
    const future = reminderFactory.build({
      id: 'future-1',
      text: 'Later',
      dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      notified: false,
    });
    useReminderStore.setState({ reminders: [due, future] });

    await useReminderStore.getState().fireDueReminders();

    const { reminders } = useReminderStore.getState();
    const updatedDue = reminders.find((r) => r.id === 'due-1');
    const updatedFuture = reminders.find((r) => r.id === 'future-1');
    expect(updatedDue?.notified).toBe(true);
    expect(updatedFuture?.notified).toBe(false);
  });

  it('leaves already-notified and paused past-due reminders untouched (no re-fire)', async () => {
    const alreadyNotified = reminderFactory.build({
      id: 'notified-past',
      text: 'Submit timesheet',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
      notified: true,
    });
    const pausedPastDue = recurringReminderFactory.build({
      id: 'paused-past',
      text: 'Move',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
      paused: true,
    });
    useReminderStore.setState({ reminders: [alreadyNotified, pausedPastDue] });

    await useReminderStore.getState().fireDueReminders();

    const { reminders } = useReminderStore.getState();
    const notified = reminders.find((r) => r.id === 'notified-past');
    const paused = reminders.find((r) => r.id === 'paused-past');
    // Only notified:false && !paused && !completed && due flips — these are skipped.
    expect(notified?.notified).toBe(true);
    expect(paused?.notified).not.toBe(true);
    expect(paused?.paused).toBe(true);
    // Nothing was due to fire, so no persistence write happened.
    expect(setRemindersMock).not.toHaveBeenCalled();
  });
});

describe('addReminder with an interval recurrence', () => {
  it('schedules the alarm at the reminder due date', async () => {
    const dueDate = new Date(Date.now() + 60_000);

    await useReminderStore.getState().addReminder('Move', dueDate, {
      frequency: 'interval',
      intervalMinutes: 30,
    });

    const id = useReminderStore.getState().reminders[0].id;
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith(
      `reminder-${id}`,
      new Date(dueDate.getTime())
    );
  });
});

describe('snoozeReminder', () => {
  it('reschedules an overdue reminder to N minutes from now, not from its past due date', async () => {
    const overdue = reminderFactory.build({
      id: 'snooze-1',
      text: 'Submit report',
      dueDate: new Date(Date.now() - 90 * 60_000).toISOString(), // 90 min overdue
      notified: true,
    });
    useReminderStore.setState({ reminders: [overdue] });

    const before = Date.now();
    await useReminderStore.getState().snoozeReminder('snooze-1', 5);

    const updated = useReminderStore.getState().reminders[0];
    const newDue = new Date(updated.dueDate).getTime();
    // Snoozed to ~now + 5 min (future), not 85 min still in the past; notified cleared.
    expect(newDue).toBeGreaterThanOrEqual(before + 5 * 60_000);
    expect(newDue).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);
    expect(updated.notified).toBe(false);
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith('reminder-snooze-1', new Date(newDue));
  });
});

describe('toggleReminder on an active overdue recurring reminder', () => {
  it('restarts the cadence from now (not pastDueDate + interval) and re-arms the alarm', async () => {
    const pastDueDate = new Date(Date.now() - 90 * 60_000).toISOString(); // 90 min overdue
    const overdue = recurringReminderFactory.build({
      id: 'overdue-interval',
      text: 'Move',
      dueDate: pastDueDate,
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    useReminderStore.setState({ reminders: [overdue] });

    const before = Date.now();
    await useReminderStore.getState().toggleReminder('overdue-interval');
    const after = Date.now();

    const updated = useReminderStore.getState().reminders[0];
    const newDue = new Date(updated.dueDate).getTime();
    // Restart anchors to NOW + interval, not to the stale past dueDate + interval.
    expect(newDue).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(newDue).toBeLessThanOrEqual(after + 30 * 60_000);
    expect(updated.completed).toBe(false);
    expect(fakeScheduler.cancel).toHaveBeenCalledWith('reminder-overdue-interval');
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith(
      'reminder-overdue-interval',
      new Date(newDue)
    );
  });
});

describe('toggleReminder on a non-recurring reminder', () => {
  it('completes then uncompletes, tracking and clearing completedAt and the alarm', async () => {
    const oneOff = reminderFactory.build({
      id: 'one-off',
      text: 'Submit form',
      dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    useReminderStore.setState({ reminders: [oneOff] });

    await useReminderStore.getState().toggleReminder('one-off');

    const completed = useReminderStore.getState().reminders[0];
    expect(completed.completed).toBe(true);
    expect(typeof completed.completedAt).toBe('string');
    expect(fakeScheduler.cancel).toHaveBeenCalledWith('reminder-one-off');

    await useReminderStore.getState().toggleReminder('one-off');

    const reopened = useReminderStore.getState().reminders[0];
    expect(reopened.completed).toBe(false);
    expect(reopened.completedAt).toBeUndefined();
  });
});

describe('write failures', () => {
  beforeEach(() => {
    setRemindersMock.mockResolvedValue({
      success: false,
      error: {
        type: 'quota_exceeded',
        message: 'quota',
        key: 'reminders',
        area: 'local',
      },
    });
  });

  it('toggleReminder leaves state, alarm, and success toast untouched on a failed write', async () => {
    const reminder = reminderFactory.build({
      id: 'wf-toggle',
      text: 'Drink water',
      dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      completed: false,
    });
    const originalDueDate = reminder.dueDate;
    useReminderStore.setState({ reminders: [reminder] });

    await useReminderStore.getState().toggleReminder('wf-toggle');

    const after = useReminderStore.getState().reminders[0];
    // In-memory state must be unchanged — the UI must not lie about a write that failed.
    expect(after.completed).toBe(false);
    expect(after.dueDate).toBe(originalDueDate);
    expect(toastError).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(fakeScheduler.scheduleAt).not.toHaveBeenCalled();
  });

  it('addReminder returns false and shows an error toast on a failed write', async () => {
    const result = await useReminderStore
      .getState()
      .addReminder('New reminder', new Date(Date.now() + 60_000));

    expect(result).toBe(false);
    expect(toastError).toHaveBeenCalled();
    // Nothing committed to state.
    expect(useReminderStore.getState().reminders).toHaveLength(0);
  });
});

describe('alarm scheduling failures', () => {
  it('keeps the snooze saved and warns distinctly when arming the alarm throws', async () => {
    const overdue = reminderFactory.build({
      id: 'arm-fail',
      text: 'Submit report',
      dueDate: new Date(Date.now() - 90 * 60_000).toISOString(),
      notified: true,
    });
    useReminderStore.setState({ reminders: [overdue] });
    fakeScheduler.scheduleAt.mockRejectedValueOnce(new Error('MAX_SUSTAINED_ALARMS'));

    const before = Date.now();
    await useReminderStore.getState().snoozeReminder('arm-fail', 5);

    const updated = useReminderStore.getState().reminders[0];
    // The data write + state commit stand: the reminder was rescheduled into the future.
    expect(new Date(updated.dueDate).getTime()).toBeGreaterThanOrEqual(before + 5 * 60_000);
    expect(updated.notified).toBe(false);
    // Distinct warning, not the generic save error.
    expect(toastWarning).toHaveBeenCalledWith(
      "Reminder saved, but we couldn't schedule its alert."
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('keeps the added reminder and warns distinctly when arming the alarm throws', async () => {
    fakeScheduler.scheduleAt.mockRejectedValueOnce(new Error('MAX_SUSTAINED_ALARMS'));

    const result = await useReminderStore
      .getState()
      .addReminder('New reminder', new Date(Date.now() + 60_000));

    // Add still succeeds — the reminder is saved despite the scheduling throw.
    expect(result).toBe(true);
    expect(useReminderStore.getState().reminders).toHaveLength(1);
    expect(toastWarning).toHaveBeenCalledWith(
      "Reminder saved, but we couldn't schedule its alert."
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still removes the reminder and stays silent when clearing the alarm throws', async () => {
    const reminder = reminderFactory.build({
      id: 'clear-fail',
      text: 'Drink water',
      dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    useReminderStore.setState({ reminders: [reminder] });
    fakeScheduler.cancel.mockRejectedValueOnce(new Error('alarm gone'));

    await useReminderStore.getState().deleteReminder('clear-fail');

    // Deletion stands; a clear failure only logs — no user-facing toast.
    expect(useReminderStore.getState().reminders).toHaveLength(0);
    expect(toastError).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });
});
