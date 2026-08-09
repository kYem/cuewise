import {
  configurePlatform,
  logger,
  type Reminder,
  resetPlatform,
  type SyncMutationSink,
} from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
import { useReminderStore } from './reminder-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getReminders: vi.fn(),
  setReminders: vi.fn(),
  // Faithful, not a stub: reading inside the write is the property under test, so a mock that
  // took the caller's list would let a read hoisted back out of the lock pass.
  updateReminders: vi.fn(async (mutate: (reminders: Reminder[]) => Reminder[]) => {
    const reminders = mutate((await storage.getReminders()) ?? []);
    return { result: await storage.setReminders(reminders), reminders };
  }),
  withCollectionLock: vi.fn(<T>(_lock: string, apply: () => Promise<T>) => apply()),
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

/**
 * Seeds the store and storage with deliberately different lists — a pull that landed after the
 * store last read. Every writer must persist against `stored`, not the state it can see.
 */
function storageAheadOfStore(inStore: Reminder[], stored: Reminder[]): void {
  useReminderStore.setState({ reminders: inStore });
  getRemindersMock.mockResolvedValue(stored);
}

function persistedIds(): string[] {
  return (setRemindersMock.mock.calls[0][0] as Reminder[]).map((r) => r.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  // The store is a cache of storage, equal to it after every action — which is what lets a test
  // seed with setState or an earlier action and still exercise the read-inside-the-write.
  getRemindersMock.mockImplementation(async () => useReminderStore.getState().reminders);
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

  // `notified` is already persisted by the time these toast, so a collapsed duplicate is a
  // reminder the user is never told about at all.
  it('announces both of two due reminders that share the same text', async () => {
    const due = (id: string) =>
      reminderFactory.build({
        id,
        text: 'Stretch',
        dueDate: new Date(Date.now() - 60_000).toISOString(),
        notified: false,
      });
    useReminderStore.setState({ reminders: [due('a'), due('b')] });

    await useReminderStore.getState().fireDueReminders();

    expect(toastWarning).toHaveBeenCalledTimes(2);
  });

  // The shipped default log level is 'error', so an info line leaves a reminder that fired but
  // never reached the user with no trace at all.
  it('records the sweep at a level the shipped log level keeps', async () => {
    const due = reminderFactory.build({
      id: 'due-1',
      text: 'Stand up',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
      notified: false,
    });
    useReminderStore.setState({ reminders: [due] });
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await useReminderStore.getState().fireDueReminders();

    expect(logged).toHaveBeenCalledWith('Fired due reminders', { count: 1 });
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

describe('sync sink wiring', () => {
  const markMutated = vi.fn();
  const markDeleted = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markDeleted };

  beforeEach(() => {
    markMutated.mockClear();
    markDeleted.mockClear();
    configurePlatform({ syncSink: fakeSink });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('notifies markMutated with the new reminder id after addReminder persists', async () => {
    await useReminderStore.getState().addReminder('Drink water', new Date(Date.now() + 60_000));

    const created = useReminderStore.getState().reminders[0];
    expect(markMutated).toHaveBeenCalledWith('reminders', created.id);
  });

  // Marking a gone id dirty makes the next push seal a tombstone this device never authored.
  // One writer per test: snoozeReminder commits the empty fresh list, so a second action in the
  // same test bails on its own pre-check and never reaches the guard under examination.
  const deletedBeforeTheWrite = (): void => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    useReminderStore.setState({
      reminders: [recurringReminderFactory.build({ id: 'gone', recurring, paused: false })],
    });
    getRemindersMock.mockResolvedValue([]);
  };

  it('snoozeReminder does not mark a reminder the pull deleted dirty', async () => {
    deletedBeforeTheWrite();

    await useReminderStore.getState().snoozeReminder('gone', 5);

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('setReminderPaused does not mark a reminder the pull deleted dirty', async () => {
    deletedBeforeTheWrite();

    await useReminderStore.getState().setReminderPaused('gone', true);

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markDeleted with the reminder id after deleteReminder persists', async () => {
    const reminder = reminderFactory.build();
    useReminderStore.setState({ reminders: [reminder] });

    await useReminderStore.getState().deleteReminder(reminder.id);

    expect(markDeleted).toHaveBeenCalledWith('reminders', reminder.id);
  });
});

describe('converging on reminders written elsewhere', () => {
  const markMutated = vi.fn();
  const markMutatedBulk = vi.fn();
  const markDeleted = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markMutatedBulk, markDeleted };

  const mine = reminderFactory.build({ text: 'mine' });
  const theirs = reminderFactory.build({ text: 'pulled from the other device' });

  async function initializeObserving(): Promise<ReturnType<typeof fakeObservableStore>> {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store, syncSink: fakeSink });
    getRemindersMock.mockResolvedValue([mine]);
    await useReminderStore.getState().initialize();
    return fake;
  }

  beforeEach(() => {
    // vitest's restoreMocks resets spies, not vi.fn()s — a leftover warn would satisfy the next
    // test's waitFor before it has done anything.
    toastWarning.mockClear();
  });

  // Not just the sink: the observer is module-scoped, so a fake left registered keeps it
  // subscribed to a dead backend for any describe added after this one.
  afterEach(() => {
    resetPlatform();
  });

  it('adopts a reminder the sync engine wrote straight to storage', async () => {
    const fake = await initializeObserving();
    getRemindersMock.mockResolvedValue([mine, theirs]);

    fake.emit(['reminders']);

    await vi.waitFor(() =>
      expect(useReminderStore.getState().reminders.map((reminder) => reminder.text)).toEqual([
        'mine',
        'pulled from the other device',
      ])
    );
  });

  it('recomputes the widget buckets, not only the full list', async () => {
    const fake = await initializeObserving();
    const upcoming = reminderFactory.build({
      text: 'pulled and upcoming',
      dueDate: new Date(Date.now() + 3_600_000).toISOString(),
      completed: false,
    });
    getRemindersMock.mockResolvedValue([mine, upcoming]);

    fake.emit(['reminders']);

    await vi.waitFor(() =>
      expect(useReminderStore.getState().upcomingReminders.map((each) => each.text)).toContain(
        'pulled and upcoming'
      )
    );
  });

  it('keeps the pulled reminder when the next local write rewrites the whole list', async () => {
    const fake = await initializeObserving();
    getRemindersMock.mockResolvedValue([mine, theirs]);
    fake.emit(['reminders']);
    await vi.waitFor(() => expect(useReminderStore.getState().reminders).toHaveLength(2));

    await useReminderStore.getState().addReminder('added here', new Date(Date.now() + 60_000));

    const persisted = setRemindersMock.mock.lastCall?.[0] ?? [];
    expect(persisted.map((reminder) => reminder.text)).toEqual([
      'mine',
      'pulled from the other device',
      'added here',
    ]);
  });

  it('does not report a pulled change back to the sync engine', async () => {
    const fake = await initializeObserving();
    getRemindersMock.mockResolvedValue([mine, theirs]);

    fake.emit(['reminders']);

    await vi.waitFor(() => expect(useReminderStore.getState().reminders).toHaveLength(2));
    expect(markMutated).not.toHaveBeenCalled();
    expect(markMutatedBulk).not.toHaveBeenCalled();
    expect(markDeleted).not.toHaveBeenCalled();
  });

  it('leaves the in-memory buckets alone when its own write is announced back', async () => {
    const fake = await initializeObserving();
    const before = useReminderStore.getState().upcomingReminders;
    const readsAfterInit = getRemindersMock.mock.calls.length;

    fake.emit(['reminders']);

    await vi.waitFor(() =>
      expect(getRemindersMock.mock.calls.length).toBeGreaterThan(readsAfterInit)
    );
    expect(useReminderStore.getState().upcomingReminders).toBe(before);
  });

  it('keeps the list it has when the re-read fails, and warns the view is stale', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = await initializeObserving();
    const before = useReminderStore.getState().reminders;
    getRemindersMock.mockRejectedValue(new Error('Could not read the stored reminders list'));

    fake.emit(['reminders']);

    await vi.waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('your reminders'))
    );
    expect(useReminderStore.getState().reminders).toBe(before);
    expect(useReminderStore.getState().error).toBeNull();
  });

  // ReminderWidget chains fireDueReminders off initialize(), and that rewrites the whole array
  // from the in-memory copy — without the awaited reconcile it writes the pre-pull one.
  it('picks up a pull that landed while it was still loading', async () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store, syncSink: fakeSink });
    getRemindersMock.mockResolvedValue([mine]);
    const loaded = useReminderStore.getState().initialize();
    getRemindersMock.mockResolvedValue([mine, theirs]);
    await loaded;

    expect(useReminderStore.getState().reminders).toHaveLength(2);
  });
});

// Storage holds a reminder the store has not seen — a pull that landed while this action was
// waiting on the lock. Each writer must merge into it, and derive from it, not from `get()`.
describe('writers read storage, not their own snapshot', () => {
  const pulled = () => reminderFactory.build({ id: 'pulled', text: 'from another device' });

  it('addReminder keeps it', async () => {
    const incoming = pulled();
    storageAheadOfStore([], [incoming]);

    await useReminderStore.getState().addReminder('Stretch', new Date(Date.now() + 60_000));

    expect(persistedIds()).toContain(incoming.id);
  });

  it('deleteReminder keeps it', async () => {
    const mine = reminderFactory.build({ id: 'mine' });
    const incoming = pulled();
    storageAheadOfStore([mine], [mine, incoming]);

    await useReminderStore.getState().deleteReminder('mine');

    expect(persistedIds()).toEqual([incoming.id]);
  });

  it('markAsNotified keeps it', async () => {
    const mine = reminderFactory.build({ id: 'mine' });
    const incoming = pulled();
    storageAheadOfStore([mine], [mine, incoming]);

    await useReminderStore.getState().markAsNotified('mine');

    expect(persistedIds()).toContain(incoming.id);
  });

  it('fireDueReminders keeps it', async () => {
    const due = reminderFactory.build({
      id: 'due',
      notified: false,
      dueDate: new Date(Date.now() - 60_000).toISOString(),
    });
    const incoming = pulled();
    storageAheadOfStore([due], [due, incoming]);

    await useReminderStore.getState().fireDueReminders();

    expect(persistedIds()).toContain(incoming.id);
  });

  // Only a snooze or an advance clears `notified`, so stamping it on a reminder a pull just
  // snoozed silences that occurrence for good.
  it('fireDueReminders leaves a reminder the pull already snoozed alone', async () => {
    const stale = reminderFactory.build({
      id: 'snoozed',
      notified: false,
      dueDate: new Date(Date.now() - 60_000).toISOString(),
    });
    const snoozed = { ...stale, dueDate: new Date(Date.now() + 60 * 60_000).toISOString() };
    storageAheadOfStore([stale], [snoozed]);

    await useReminderStore.getState().fireDueReminders();

    expect(setRemindersMock).not.toHaveBeenCalled();
  });

  // initialize's auto-advance had no coverage at all: disabling the whole branch kept the suite
  // green, so the happy path is pinned here alongside the race.
  it('initialize advances an overdue recurring reminder and arms its next occurrence', async () => {
    const overdue = recurringReminderFactory.build({
      id: 'overdue',
      dueDate: new Date(Date.now() - 60 * 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
      paused: false,
      completed: false,
    });
    getRemindersMock.mockResolvedValue([overdue]);
    const before = Date.now();

    await useReminderStore.getState().initialize();

    // The persisted list, not the final state: initialize ends with a reconcile that re-reads,
    // and the mocked setReminders does not feed getReminders.
    const written = setRemindersMock.mock.calls[0][0] as Reminder[];
    expect(new Date(written[0].dueDate).getTime()).toBeGreaterThan(before);
    expect(fakeScheduler.scheduleAt).toHaveBeenCalledWith('reminder-overdue', expect.any(Date));
  });

  it('initialize advances the pulled version, not the one it first read', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const stale = recurringReminderFactory.build({
      id: 'overdue',
      text: 'Move',
      dueDate: new Date(Date.now() - 60 * 60_000).toISOString(),
      recurring,
      paused: false,
      completed: false,
    });
    getRemindersMock.mockResolvedValueOnce([stale]);
    getRemindersMock.mockResolvedValue([{ ...stale, text: 'Move around' }]);

    await useReminderStore.getState().initialize();

    const written = setRemindersMock.mock.calls[0][0] as Reminder[];
    expect(written[0].text).toBe('Move around');
  });

  // Branching from the snapshot would complete a series a pull had just made recurring.
  it('toggleReminder advances a reminder the pull turned recurring', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const oneOff = reminderFactory.build({ id: 'r', completed: false });
    storageAheadOfStore([oneOff], [{ ...oneOff, recurring }]);

    await useReminderStore.getState().toggleReminder('r');

    const written = setRemindersMock.mock.calls[0][0] as Reminder[];
    expect(written[0].completed).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith('Recurring reminder advanced to next occurrence');
  });

  // The mirror case: the snapshot says recurring, the fresh entity is a one-off. Completing it
  // is right; silently writing nothing while still cancelling its alarm is not.
  it('toggleReminder completes a reminder the pull turned into a one-off', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const stale = recurringReminderFactory.build({ id: 'r', recurring, completed: false });
    const { recurring: _dropped, ...oneOff } = stale;
    storageAheadOfStore([stale], [oneOff as Reminder]);

    await useReminderStore.getState().toggleReminder('r');

    const written = setRemindersMock.mock.calls[0][0] as Reminder[];
    expect(written[0].completed).toBe(true);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('toggleReminder touches no alarm when the pull deleted it', async () => {
    const mine = reminderFactory.build({ id: 'gone', completed: false });
    storageAheadOfStore([mine], []);

    await useReminderStore.getState().toggleReminder('gone');

    expect(fakeScheduler.cancel).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith('This reminder no longer exists');
  });

  // Committing here would also announce the write to the sync engine, which never happened.
  it('toggleReminder commits nothing when the pull deleted it', async () => {
    const mine = reminderFactory.build({ id: 'gone', completed: false });
    storageAheadOfStore([mine], []);

    await useReminderStore.getState().toggleReminder('gone');

    expect(useReminderStore.getState().reminders).toEqual([mine]);
  });

  // Cancelling the alarm of a reminder the pull turned into a one-off leaves storage saying
  // active while nothing will ever fire it.
  it('setReminderPaused touches no alarm when the pull dropped recurrence', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const stale = recurringReminderFactory.build({ id: 'r', recurring, paused: false });
    const { recurring: _dropped, ...oneOff } = stale;
    storageAheadOfStore([stale], [oneOff as Reminder]);

    await useReminderStore.getState().setReminderPaused('r', true);

    expect(fakeScheduler.cancel).not.toHaveBeenCalled();
  });

  it('snoozeReminder arms no alarm when the pull deleted it', async () => {
    const mine = reminderFactory.build({ id: 'gone' });
    storageAheadOfStore([mine], []);

    await useReminderStore.getState().snoozeReminder('gone', 5);

    expect(fakeScheduler.scheduleAt).not.toHaveBeenCalled();
  });

  // EditReminderForm closes on `true`, so reporting success here loses the edit silently.
  it('updateReminder reports failure when the pull deleted it', async () => {
    const mine = reminderFactory.build({ id: 'gone', text: 'Stretch' });
    storageAheadOfStore([mine], []);

    const ok = await useReminderStore.getState().updateReminder('gone', { text: 'Stretch legs' });

    expect(ok).toBe(false);
    expect(toastWarning).toHaveBeenCalledWith('This reminder no longer exists');
  });

  // Editing only the due date must not wake a reminder the user paused.
  it('updateReminder arms no alarm for a paused reminder', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const paused = recurringReminderFactory.build({ id: 'r', recurring, paused: true });
    useReminderStore.setState({ reminders: [paused] });

    await useReminderStore
      .getState()
      .updateReminder('r', { dueDate: new Date(Date.now() + 60_000).toISOString() });

    expect(fakeScheduler.scheduleAt).not.toHaveBeenCalled();
  });

  it('snoozeReminder says so when the pull deleted it', async () => {
    storageAheadOfStore([reminderFactory.build({ id: 'gone' })], []);

    await useReminderStore.getState().snoozeReminder('gone', 5);

    expect(toastWarning).toHaveBeenCalledWith('This reminder no longer exists');
  });

  // Arming here resurrects a wake on a reminder the user explicitly paused.
  it('snoozeReminder arms no alarm when the pull paused it', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const active = recurringReminderFactory.build({ id: 'r', recurring, paused: false });
    storageAheadOfStore([active], [{ ...active, paused: true }]);

    await useReminderStore.getState().snoozeReminder('r', 5);

    expect(fakeScheduler.scheduleAt).not.toHaveBeenCalled();
  });

  // Pausing must not touch dueDate; the snapshot's copy predates the pull's advance.
  it('setReminderPaused does not revert a dueDate the pull advanced', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const stale = recurringReminderFactory.build({ id: 'r', recurring, paused: false });
    const advanced = { ...stale, dueDate: new Date(Date.now() + 30 * 60_000).toISOString() };
    storageAheadOfStore([stale], [advanced]);

    await useReminderStore.getState().setReminderPaused('r', true);

    const written = setRemindersMock.mock.calls[0][0] as Reminder[];
    expect(written[0].dueDate).toBe(advanced.dueDate);
    expect(written[0].paused).toBe(true);
  });

  // The advanced entity is spread from the fresh read, so a rename the pull brought survives.
  it('toggleReminder advances the pulled version of a recurring reminder', async () => {
    const recurring = { frequency: 'interval' as const, intervalMinutes: 30 };
    const stale = recurringReminderFactory.build({ id: 'r', text: 'Stretch', recurring });
    const renamed = { ...stale, text: 'Stretch legs' };
    storageAheadOfStore([stale], [renamed]);

    await useReminderStore.getState().toggleReminder('r');

    const written = setRemindersMock.mock.calls[0][0] as Reminder[];
    expect(written[0].text).toBe('Stretch legs');
  });
});
