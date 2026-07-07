import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getRemindersMock, setRemindersMock } = vi.hoisted(() => ({
  getRemindersMock: vi.fn(),
  setRemindersMock: vi.fn(),
}));
vi.mock('@cuewise/storage', () => ({
  getReminders: getRemindersMock,
  setReminders: setRemindersMock,
}));

type AlarmListener = (alarm: { name: string }) => void;
type ButtonListener = (id: string, buttonIndex: number) => void;
type ClickListener = (id: string) => void;
type Reminder = ReturnType<typeof reminderFactory.build>;

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

const chromeMock = {
  alarms: {
    create: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve(true)),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(() => Promise.resolve('id')),
    clear: vi.fn(() => Promise.resolve(true)),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
    onButtonClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([] as { id?: number; windowId?: number }[])),
    update: vi.fn(() => Promise.resolve()),
    create: vi.fn(() => Promise.resolve()),
  },
  windows: { update: vi.fn(() => Promise.resolve()) },
  runtime: { getURL: (path: string) => path },
};

let fireAlarm: AlarmListener;
let fireButton: ButtonListener;
let fireClick: ClickListener;

beforeAll(async () => {
  global.chrome = chromeMock as unknown as typeof chrome;
  // Registers the alarm/notification listeners against chromeMock.
  await import('./background');
  fireAlarm = chromeMock.alarms.onAlarm.addListener.mock.calls[0][0] as AlarmListener;
  fireButton = chromeMock.notifications.onButtonClicked.addListener.mock
    .calls[0][0] as ButtonListener;
  fireClick = chromeMock.notifications.onClicked.addListener.mock.calls[0][0] as ClickListener;
});

beforeEach(() => {
  vi.clearAllMocks();
  // The shared vitest setup resets global.chrome each test — re-assert our mock.
  global.chrome = chromeMock as unknown as typeof chrome;
  setRemindersMock.mockResolvedValue({ success: true });
});

describe('background: reminder alarm fires', () => {
  it('notifies with Done/Snooze buttons and re-arms a recurring reminder', async () => {
    const reminder = recurringReminderFactory.build({
      id: 'r1',
      text: 'Stretch',
      dueDate: new Date(Date.now() - 1000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    getRemindersMock.mockResolvedValue([reminder]);

    fireAlarm({ name: 'reminder-r1' });

    await vi.waitFor(() => {
      expect(chromeMock.notifications.create).toHaveBeenCalledWith(
        'reminder-r1',
        expect.objectContaining({ buttons: [{ title: 'Done' }, { title: 'Snooze 5 min' }] })
      );
    });
    // Recurring reminders must re-arm for their next occurrence.
    await vi.waitFor(() => {
      expect(chromeMock.alarms.create).toHaveBeenCalledWith('reminder-r1', expect.any(Object));
    });
  });
});

describe('background: notification action buttons', () => {
  it('completes the reminder on the Done button (index 0)', async () => {
    const reminder = reminderFactory.build({ id: 'r2', completed: false });
    getRemindersMock.mockResolvedValue([reminder]);

    fireButton('reminder-r2', 0);

    await vi.waitFor(() => {
      const saved = setRemindersMock.mock.calls[0][0] as Reminder[];
      const updated = saved.find((r) => r.id === 'r2');
      expect(updated?.completed).toBe(true);
    });
  });

  it('snoozes the reminder on the Snooze button (index 1) and re-arms the alarm', async () => {
    const reminder = reminderFactory.build({
      id: 'r3',
      completed: false,
      dueDate: new Date(Date.now() - 1000).toISOString(),
    });
    getRemindersMock.mockResolvedValue([reminder]);

    fireButton('reminder-r3', 1);

    await vi.waitFor(() => {
      const saved = setRemindersMock.mock.calls[0][0] as Reminder[];
      const updated = saved.find((r) => r.id === 'r3');
      expect(updated?.completed).toBe(false);
      expect(updated?.notified).toBe(false);
    });
    await vi.waitFor(() => {
      expect(chromeMock.alarms.create).toHaveBeenCalledWith('reminder-r3', expect.any(Object));
    });
  });
});

describe('background: reminder alarm guards', () => {
  it('does not notify or re-arm a completed reminder', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'done', completed: true })]);

    fireAlarm({ name: 'reminder-done' });
    await flushAsync();

    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('does not notify or re-arm a paused recurring reminder', async () => {
    getRemindersMock.mockResolvedValue([
      recurringReminderFactory.build({
        id: 'paused',
        paused: true,
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      }),
    ]);

    fireAlarm({ name: 'reminder-paused' });
    await flushAsync();

    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('does not notify when the reminder is not found', async () => {
    getRemindersMock.mockResolvedValue([]);

    fireAlarm({ name: 'reminder-missing' });
    await flushAsync();

    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
  });

  it('notifies a one-off reminder but does not re-arm it', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'once', completed: false })]);

    fireAlarm({ name: 'reminder-once' });
    await vi.waitFor(() => expect(chromeMock.notifications.create).toHaveBeenCalled());
    await flushAsync();

    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });
});

describe('background: notification click', () => {
  it('clears the notification and focuses an existing tab', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([{ id: 5, windowId: 1 }]);

    fireClick('reminder-x');

    await vi.waitFor(() =>
      expect(chromeMock.notifications.clear).toHaveBeenCalledWith('reminder-x')
    );
    await vi.waitFor(() =>
      expect(chromeMock.tabs.update).toHaveBeenCalledWith(5, { active: true })
    );
  });

  it('ignores a non-reminder notification', async () => {
    fireClick('pomodoro-complete');
    await flushAsync();

    expect(chromeMock.notifications.clear).not.toHaveBeenCalled();
  });
});
