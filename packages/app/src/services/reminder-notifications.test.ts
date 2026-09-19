import { configurePlatform, logger, type Reminder } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordReminderActivity } from './reminder-activity';
import { armMissingReminderAlarms, handleReminderFire } from './reminder-notifications';

vi.mock('./reminder-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./reminder-activity')>()),
  recordReminderActivity: vi.fn(() => Promise.resolve()),
}));
const recordActivity = vi.mocked(recordReminderActivity);

vi.mock('@cuewise/storage', () => ({
  getReminders: vi.fn(),
  setReminders: vi.fn(),
  // Faithful, not a stub: reading inside the write is the property under test, so a mock that
  // took the caller's list would let a read hoisted back out of the lock pass.
  updateReminders: vi.fn(async (mutate: (reminders: Reminder[]) => Reminder[]) => {
    const reminders = mutate((await storage.getReminders()) ?? []);
    return { result: await storage.setReminders(reminders), reminders };
  }),
}));

const getRemindersMock = vi.mocked(storage.getReminders);
const setRemindersMock = vi.mocked(storage.setReminders);

// Spy notifier/scheduler injected via the platform ports — assert against these
// instead of any concrete adapter.
const notify = vi.fn(() => Promise.resolve());
const scheduleAt = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  setRemindersMock.mockResolvedValue({ success: true });
  configurePlatform({
    notifier: { notify, clear: async () => {} },
    scheduler: {
      deliversInBackground: true,
      persistsAcrossRestarts: false,
      scheduleAt,
      cancel: async () => {},
    },
  });
});

describe('handleReminderFire', () => {
  it('notifies a due reminder with Done/Snooze and marks it notified', async () => {
    getRemindersMock.mockResolvedValue([
      reminderFactory.build({ id: 'r1', text: 'Stretch', completed: false }),
    ]);

    await handleReminderFire('reminder-r1');

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reminder-r1',
        body: 'Stretch',
        actions: ['Done', 'Snooze 5 min'],
      })
    );
    const saved = setRemindersMock.mock.calls[0][0];
    expect(saved.find((r) => r.id === 'r1')?.notified).toBe(true);
  });

  // The notify is an OS round trip, so a pull has time to land inside it. Writing the list read
  // before it would drop whatever the pull brought.
  it('keeps a reminder that arrived while the notification was up', async () => {
    const firing = reminderFactory.build({ id: 'r1', text: 'Stretch', completed: false });
    const pulled = reminderFactory.build({ id: 'pulled' });
    getRemindersMock.mockResolvedValueOnce([firing]);
    notify.mockImplementationOnce(async () => {
      getRemindersMock.mockResolvedValue([firing, pulled]);
    });

    await handleReminderFire('reminder-r1');

    const saved = setRemindersMock.mock.calls[0][0];
    expect(saved.map((r) => r.id)).toEqual(['r1', 'pulled']);
    expect(saved.find((r) => r.id === 'r1')?.notified).toBe(true);
  });

  // The recurrence decision is re-made against the fresh read: advancing a reminder the pull
  // paused would undo the pause and arm a wake that must never fire.
  it('does not advance a recurring reminder the pull paused during the notification', async () => {
    const active = recurringReminderFactory.build({
      id: 'r4',
      recurring: { frequency: 'interval', intervalMinutes: 30 },
      paused: false,
    });
    getRemindersMock.mockResolvedValueOnce([active]);
    notify.mockImplementationOnce(async () => {
      getRemindersMock.mockResolvedValue([{ ...active, paused: true }]);
    });

    await handleReminderFire('reminder-r4');

    const saved = setRemindersMock.mock.calls[0][0];
    expect(saved[0].dueDate).toBe(active.dueDate);
    expect(saved[0].notified).toBe(true);
    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('re-arms the next occurrence of a recurring reminder', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({
        id: 'r2',
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      }),
    ]);

    await handleReminderFire('reminder-r2');

    expect(notify).toHaveBeenCalled();
    expect(scheduleAt).toHaveBeenCalledWith('reminder-r2', expect.any(Date));
  });

  // setReminders resolves {success:false} on quota instead of throwing, so nothing else catches it.
  it('does not arm the next occurrence when the write did not persist', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({
        id: 'r5',
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      }),
    ]);
    setRemindersMock.mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await handleReminderFire('reminder-r5');

    expect(scheduleAt).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Could not persist the fired reminder',
      expect.anything()
    );
  });

  it('does not notify a completed reminder', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'done', completed: true })]);

    await handleReminderFire('reminder-done');

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify or re-arm a paused recurring reminder', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({
        id: 'paused',
        paused: true,
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      }),
    ]);

    await handleReminderFire('reminder-paused');

    expect(notify).not.toHaveBeenCalled();
    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('does not re-arm a one-off reminder', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'once', completed: false })]);

    await handleReminderFire('reminder-once');

    expect(notify).toHaveBeenCalled();
    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('ignores a non-reminder alarm id without touching storage', async () => {
    await handleReminderFire('pomodoro-complete');

    expect(getRemindersMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('records a fired one-off in the activity log', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r1', text: 'Stretch' })]);

    await handleReminderFire('reminder-r1');

    expect(recordActivity).toHaveBeenCalledWith({
      event: 'fired',
      reminderId: 'r1',
      text: 'Stretch',
    });
  });

  it('records the next occurrence when a fired recurring reminder re-arms', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({
        id: 'r2',
        text: 'Water',
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      }),
    ]);

    await handleReminderFire('reminder-r2');

    expect(recordActivity).toHaveBeenCalledWith({
      event: 'fired',
      reminderId: 'r2',
      text: 'Water',
      detail: expect.stringMatching(/^next \d{4}-/),
    });
  });

  it('records why a fire was skipped', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({ id: 'paused', text: 'Walk', paused: true }),
    ]);

    await handleReminderFire('reminder-paused');
    await handleReminderFire('reminder-missing');

    expect(recordActivity).toHaveBeenCalledWith({
      event: 'skipped',
      reminderId: 'paused',
      text: 'Walk',
      detail: 'paused',
    });
    expect(recordActivity).toHaveBeenCalledWith({
      event: 'skipped',
      reminderId: 'missing',
      detail: 'not found',
    });
  });
});

describe('armMissingReminderAlarms', () => {
  const nothingArmed = new Set<string>();

  it('arms a pending one-off at its due date', async () => {
    const pending = reminderFactory.build({ id: 'r1' });
    getRemindersMock.mockResolvedValue([pending]);

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r1', new Date(pending.dueDate));
  });

  it('arms an active recurring reminder', async () => {
    getRemindersMock.mockResolvedValue([recurringReminderFactory.build({ id: 'r2' })]);

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r2', expect.any(Date));
  });

  // A wake lost while the reminder was due arms in the past and fires at once: late, not never.
  it('arms an overdue undelivered one-off at its past due date', async () => {
    const overdue = reminderFactory.build({
      id: 'r3',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
    });
    getRemindersMock.mockResolvedValue([overdue]);

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r3', new Date(overdue.dueDate));
  });

  it('leaves an already-armed reminder alone', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r4' })]);

    await armMissingReminderAlarms(new Set(['reminder-r4']));

    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('does not arm a completed reminder', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r5', completed: true })]);

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('does not arm a paused recurring reminder', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({ id: 'r6', paused: true }),
    ]);

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('does not arm a one-off that was already delivered', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r7', notified: true })]);

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it('arms the rest when one wake fails to schedule', async () => {
    getRemindersMock.mockResolvedValue([
      reminderFactory.build({ id: 'r8' }),
      reminderFactory.build({ id: 'r9' }),
    ]);
    scheduleAt.mockRejectedValueOnce(new Error('alarm limit'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await armMissingReminderAlarms(nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r9', expect.any(Date));
    expect(errorLog).toHaveBeenCalledWith('Failed to re-arm reminder r8', expect.any(Error));
  });

  it('records one reconciled entry with what it re-armed', async () => {
    getRemindersMock.mockResolvedValue([
      reminderFactory.build({ id: 'r10' }),
      reminderFactory.build({ id: 'r11' }),
      reminderFactory.build({ id: 'r12', completed: true }),
    ]);

    await armMissingReminderAlarms(new Set(['reminder-r11']));

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith({
      event: 'reconciled',
      detail: 're-armed 1 of 2 pending',
    });
  });
});
