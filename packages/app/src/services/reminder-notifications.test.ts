import { configurePlatform, type Reminder } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleReminderFire } from './reminder-notifications';

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
});
