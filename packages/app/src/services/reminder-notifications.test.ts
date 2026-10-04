import { configurePlatform, DEFAULT_SETTINGS, logger, type Reminder } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { fakeNotifier } from '@cuewise/test-utils/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordReminderActivity } from './reminder-activity';
import {
  armMissingReminderAlarms,
  handleReminderFire,
  REMINDER_DONE_BUTTON,
  REMINDER_SNOOZE_BUTTON,
  respondToReminder,
} from './reminder-notifications';
import { addReminderPrompt, removeReminderPrompt } from './reminder-prompts';

vi.mock('./reminder-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./reminder-activity')>()),
  recordReminderActivity: vi.fn(() => Promise.resolve()),
}));
const recordActivity = vi.mocked(recordReminderActivity);

vi.mock('./reminder-prompts', () => ({
  addReminderPrompt: vi.fn(() => Promise.resolve()),
  removeReminderPrompt: vi.fn(() => Promise.resolve()),
}));
const addPrompt = vi.mocked(addReminderPrompt);
const removePrompt = vi.mocked(removeReminderPrompt);
const markMutated = vi.fn();

vi.mock('@cuewise/storage', () => ({
  getReminders: vi.fn(),
  setReminders: vi.fn(),
  getSettings: vi.fn(),
  // Faithful, not a stub: reading inside the write is the property under test, so a mock that
  // took the caller's list would let a read hoisted back out of the lock pass.
  updateReminders: vi.fn(async (mutate: (reminders: Reminder[]) => Reminder[]) => {
    const reminders = mutate((await storage.getReminders()) ?? []);
    return { result: await storage.setReminders(reminders), reminders };
  }),
}));

const getRemindersMock = vi.mocked(storage.getReminders);
const setRemindersMock = vi.mocked(storage.setReminders);
const getSettingsMock = vi.mocked(storage.getSettings);

// Spy notifier/scheduler injected via the platform ports — assert against these
// instead of any concrete adapter.
const notifier = fakeNotifier();
const notify = notifier.notify;
const scheduleAt = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  setRemindersMock.mockResolvedValue({ success: true });
  getSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);
  configurePlatform({
    notifier,
    scheduler: {
      deliversInBackground: true,
      persistsAcrossRestarts: false,
      scheduleAt,
      cancel: async () => {},
    },
    syncSink: { markMutated, markDeleted: vi.fn() },
  });
});

describe('the in-app prompt a fire raises', () => {
  it('raises a prompt for the reminder that fired', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r1', completed: false })]);

    await handleReminderFire('reminder-r1');

    expect(addPrompt).toHaveBeenCalledWith('r1');
  });

  it('still raises it when the notification could not be shown', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r1', completed: false })]);
    notify.mockRejectedValueOnce(new Error('notifications blocked'));

    await handleReminderFire('reminder-r1');

    expect(addPrompt).toHaveBeenCalledWith('r1');
  });

  it('raises none for a reminder the fire skips', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r1', completed: true })]);

    await handleReminderFire('reminder-r1');

    expect(addPrompt).not.toHaveBeenCalled();
  });
});

describe('respondToReminder', () => {
  it('Done completes a one-off, tells sync, and clears its notification and prompt', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r1', completed: false })]);

    await respondToReminder('r1', REMINDER_DONE_BUTTON);

    expect(setRemindersMock.mock.calls[0][0][0].completed).toBe(true);
    expect(markMutated).toHaveBeenCalledWith('reminders', 'r1');
    expect(notifier.clear).toHaveBeenCalledWith('reminder-r1');
    expect(removePrompt).toHaveBeenCalledWith('r1');
  });

  it('Snooze moves it by the length asked for, tells sync and re-arms its wake', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r1', completed: false })]);
    const before = Date.now();

    await respondToReminder('r1', REMINDER_SNOOZE_BUTTON, 30);

    const due = new Date(setRemindersMock.mock.calls[0][0][0].dueDate).getTime();
    expect(due - before).toBeGreaterThanOrEqual(30 * 60_000);
    expect(due - before).toBeLessThan(31 * 60_000);
    expect(markMutated).toHaveBeenCalledWith('reminders', 'r1');
    expect(scheduleAt).toHaveBeenCalledWith('reminder-r1', new Date(due));
    expect(removePrompt).toHaveBeenCalledWith('r1');
  });

  it('clears the prompt of a reminder already gone, without writing', async () => {
    getRemindersMock.mockResolvedValue([]);

    await respondToReminder('r1', REMINDER_DONE_BUTTON);

    expect(setRemindersMock).not.toHaveBeenCalled();
    expect(removePrompt).toHaveBeenCalledWith('r1');
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
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'failed',
        reminderId: 'r5',
        detail: 'persist: not persisted',
      })
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

  it('notifies whatever the session notification switch says', async () => {
    getSettingsMock.mockResolvedValue({ ...DEFAULT_SETTINGS, enableNotifications: false });
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r6' })]);

    await handleReminderFire('reminder-r6');

    expect(notify).toHaveBeenCalled();
  });

  describe('when the notification is rejected', () => {
    beforeEach(() => {
      notify.mockRejectedValueOnce(new Error('Unable to download all specified images'));
      vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    it('still advances and re-arms a recurring reminder', async () => {
      const recurring = recurringReminderFactory.build({
        id: 'r2',
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      });
      getRemindersMock.mockResolvedValue([recurring]);

      await handleReminderFire('reminder-r2');

      expect(setRemindersMock.mock.calls[0][0][0].dueDate).not.toBe(recurring.dueDate);
      expect(scheduleAt).toHaveBeenCalledWith('reminder-r2', expect.any(Date));
    });

    it('leaves a one-off unnotified for the in-page toast', async () => {
      getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r8', notified: false })]);

      await handleReminderFire('reminder-r8');

      expect(setRemindersMock.mock.calls[0][0][0].notified).toBe(false);
    });

    it('records the failure together with the next occurrence', async () => {
      getRemindersMock.mockResolvedValue([
        recurringReminderFactory.build({
          id: 'r2',
          text: 'Water',
          recurring: { frequency: 'interval', intervalMinutes: 30 },
        }),
      ]);

      await handleReminderFire('reminder-r2');

      expect(recordActivity).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r2',
        text: 'Water',
        detail: expect.stringMatching(
          /^notify: Unable to download all specified images, next \d{4}-/
        ),
      });
    });
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

  it.each([
    ['paused', recurringReminderFactory.build({ id: 'skip', text: 'Walk', paused: true })],
    ['completed', reminderFactory.build({ id: 'skip', text: 'Walk', completed: true })],
  ])('records a %s reminder as skipped', async (reason, reminder) => {
    getRemindersMock.mockResolvedValue([reminder]);

    await handleReminderFire('reminder-skip');

    expect(recordActivity).toHaveBeenCalledWith({
      event: 'skipped',
      reminderId: 'skip',
      text: 'Walk',
      detail: reason,
    });
  });

  it('records a missing reminder as skipped', async () => {
    getRemindersMock.mockResolvedValue([]);

    await handleReminderFire('reminder-missing');

    expect(recordActivity).toHaveBeenCalledWith({
      event: 'skipped',
      reminderId: 'missing',
      detail: 'not found',
    });
  });

  describe('a fire that breaks records the step that failed', () => {
    const recurring = () =>
      recurringReminderFactory.build({
        id: 'r9',
        text: 'Water',
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      });

    it('lookup: with only the id, since the reminder was never read', async () => {
      getRemindersMock.mockRejectedValueOnce(new Error('storage gone'));
      vi.spyOn(logger, 'error').mockImplementation(() => {});

      await handleReminderFire('reminder-r9');

      expect(recordActivity).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r9',
        detail: 'lookup: storage gone',
      });
    });

    it.each([
      ['persist', () => setRemindersMock.mockRejectedValueOnce(new Error('step broke'))],
      ['re-arm', () => scheduleAt.mockRejectedValueOnce(new Error('step broke'))],
    ])('%s', async (step, breakStep) => {
      getRemindersMock.mockResolvedValue([recurring()]);
      breakStep();
      vi.spyOn(logger, 'error').mockImplementation(() => {});

      await handleReminderFire('reminder-r9');

      expect(recordActivity).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r9',
        text: 'Water',
        detail: `${step}: step broke`,
      });
    });
  });
});

describe('armMissingReminderAlarms', () => {
  const nothingArmed = new Set<string>();

  it('arms a pending one-off at its due date', async () => {
    const pending = reminderFactory.build({ id: 'r1' });

    await armMissingReminderAlarms([pending], nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r1', new Date(pending.dueDate));
  });

  it('arms an active recurring reminder', async () => {
    await armMissingReminderAlarms([recurringReminderFactory.build({ id: 'r2' })], nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r2', expect.any(Date));
  });

  it('arms an overdue undelivered one-off at its past due date', async () => {
    const overdue = reminderFactory.build({
      id: 'r3',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
    });

    await armMissingReminderAlarms([overdue], nothingArmed);

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r3', new Date(overdue.dueDate));
  });

  it('leaves an already-armed reminder alone', async () => {
    await armMissingReminderAlarms([reminderFactory.build({ id: 'r4' })], new Set(['reminder-r4']));

    expect(scheduleAt).not.toHaveBeenCalled();
  });

  it.each([
    ['completed', reminderFactory.build({ id: 'r5', completed: true })],
    ['paused recurring', recurringReminderFactory.build({ id: 'r6', paused: true })],
    ['already delivered one-off', reminderFactory.build({ id: 'r7', notified: true })],
  ])('does not arm a %s reminder', async (_label, reminder) => {
    const tally = await armMissingReminderAlarms([reminder], nothingArmed);

    expect(scheduleAt).not.toHaveBeenCalled();
    expect(tally.pending).toBe(0);
  });

  it('arms the rest when one wake fails to schedule, and names the failure', async () => {
    scheduleAt.mockRejectedValueOnce(new Error('alarm limit'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const tally = await armMissingReminderAlarms(
      [reminderFactory.build({ id: 'r8' }), reminderFactory.build({ id: 'r9' })],
      nothingArmed
    );

    expect(scheduleAt).toHaveBeenCalledWith('reminder-r9', expect.any(Date));
    expect(errorLog).toHaveBeenCalledWith('Failed to re-arm reminder r8', expect.any(Error));
    expect(tally).toEqual({ pending: 2, rearmed: 1, failed: ['r8'] });
    expect(recordActivity).toHaveBeenCalledWith({
      event: 'reconciled',
      detail: 're-armed 1 of 2 pending, failed: r8',
    });
  });

  it('keeps going and names every failure when several wakes fail', async () => {
    scheduleAt
      .mockRejectedValueOnce(new Error('alarm limit'))
      .mockRejectedValueOnce(new Error('alarm limit'))
      .mockRejectedValueOnce(new Error('alarm limit'));
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const tally = await armMissingReminderAlarms(
      [
        reminderFactory.build({ id: 'r8' }),
        reminderFactory.build({ id: 'r9' }),
        reminderFactory.build({ id: 'r10' }),
      ],
      nothingArmed
    );

    expect(tally.failed).toEqual(['r8', 'r9', 'r10']);
    expect(recordActivity).toHaveBeenCalledWith({
      event: 'reconciled',
      detail: 're-armed 0 of 3 pending, failed: r8 r9 r10',
    });
  });

  it('records one reconciled entry with what it re-armed', async () => {
    const tally = await armMissingReminderAlarms(
      [
        reminderFactory.build({ id: 'r10' }),
        reminderFactory.build({ id: 'r11' }),
        reminderFactory.build({ id: 'r12', completed: true }),
      ],
      new Set(['reminder-r11'])
    );

    expect(tally).toEqual({ pending: 2, rearmed: 1, failed: [] });
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith({
      event: 'reconciled',
      detail: 're-armed 1 of 2 pending',
    });
  });
});
