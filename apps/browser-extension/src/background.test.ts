import { logger } from '@cuewise/shared';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getRemindersMock, setRemindersMock, recordActivityMock } = vi.hoisted(() => ({
  getRemindersMock: vi.fn(),
  setRemindersMock: vi.fn(),
  recordActivityMock: vi.fn(() => Promise.resolve()),
}));
vi.mock('@cuewise/app/reminder-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cuewise/app/reminder-activity')>()),
  recordReminderActivity: recordActivityMock,
}));
vi.mock('@cuewise/storage', () => ({
  getReminders: getRemindersMock,
  setReminders: setRemindersMock,
  // Faithful, not a stub: the read has to happen inside the write, so a mock taking the caller's
  // list would let a read hoisted back out of the lock pass.
  updateReminders: vi.fn(async (mutate: (reminders: Reminder[]) => Reminder[]) => {
    const reminders = mutate((await getRemindersMock()) ?? []);
    return { result: await setRemindersMock(reminders), reminders };
  }),
  // Runs at module load now, sync or no sync — must resolve, background.ts chains off it.
  ensureSettingsMigrated: vi.fn(() => Promise.resolve()),
  // The fire path checks the Notifications switch before it notifies.
  getSettings: vi.fn(async () => (await import('@cuewise/shared')).DEFAULT_SETTINGS),
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
    getAll: vi.fn(() => Promise.resolve([] as { name: string }[])),
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
  runtime: {
    getURL: (path: string) => path,
    getManifest: vi.fn().mockReturnValue({ version: '9.9.9' }),
    setUninstallURL: vi.fn().mockResolvedValue(undefined),
    onInstalled: { addListener: vi.fn(), removeListener: vi.fn() },
    onStartup: { addListener: vi.fn(), removeListener: vi.fn() },
  },
};

let fireAlarm: AlarmListener;
let fireButton: ButtonListener;
let fireClick: ClickListener;
let fireInstalled: () => void;
let fireStartup: () => void;
let uninstallUrl: string | undefined;

beforeAll(async () => {
  global.chrome = chromeMock as unknown as typeof chrome;
  // Force cloud sync off for this reminder-focused test regardless of a local .env that sets
  // VITE_SYNC_API_BASE_URL — otherwise background.ts wires the sync engine (getStorage()) and
  // throws, since @cuewise/storage is mocked here. CI has no such .env, so this only bit locally.
  vi.stubEnv('VITE_SYNC_API_BASE_URL', '');
  // Registers the alarm/notification listeners against chromeMock.
  await import('./background');
  // setUninstallURL fires once at module load, before the first beforeEach's
  // clearAllMocks() — capture it now like fireAlarm/fireButton/fireClick below.
  uninstallUrl = chromeMock.runtime.setUninstallURL.mock.calls[0]?.[0];
  fireAlarm = chromeMock.alarms.onAlarm.addListener.mock.calls[0][0] as AlarmListener;
  fireButton = chromeMock.notifications.onButtonClicked.addListener.mock
    .calls[0][0] as ButtonListener;
  fireClick = chromeMock.notifications.onClicked.addListener.mock.calls[0][0] as ClickListener;
  fireInstalled = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0] as () => void;
  fireStartup = chromeMock.runtime.onStartup.addListener.mock.calls[0][0] as () => void;
  // 30s (vs the 10s default): the dynamic import above cold-transpiles the whole sync-engine
  // graph. Don't "restore the default" — that was tried on vite 8/rolldown (#241) and main's
  // full-verify run still timed out at 10062ms. Rolldown cut the transpile a lot (this file runs
  // ~2.5s uncontended), but it isn't enough when Turbo runs every package's suite in parallel on
  // a 4-vCPU runner. The ceiling costs nothing; the flake costs a red main.
}, 30_000);

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // The shared vitest setup resets global.chrome each test — re-assert our mock.
  global.chrome = chromeMock as unknown as typeof chrome;
  // It also clobbers the platform registry with no-op adapters; the shared fire
  // handler resolves the notifier/scheduler through that registry, so re-bind the
  // Chrome adapters here just as the service-worker module does on load.
  const { configureChromePlatform } = await import('./platform');
  configureChromePlatform();
  setRemindersMock.mockResolvedValue({ success: true });
});

describe('background: mapToUi', () => {
  it('maps each engine SyncStatus to its UI status', async () => {
    const { mapToUi } = await import('./background');

    expect(mapToUi('disabled')).toBe('off');
    expect(mapToUi('signing_in')).toBe('connecting');
    expect(mapToUi('key_init')).toBe('connecting');
    expect(mapToUi('enrolling')).toBe('connecting');
    expect(mapToUi('initial_sync')).toBe('connecting');
    expect(mapToUi('active')).toBe('active');
    expect(mapToUi('error')).toBe('error');
    expect(mapToUi('signed_out')).toBe('needs_reauth');
    // Collapsing these is one line, and it puts "Sign-in expired" back in front of a keyless user.
    expect(mapToUi('needs_enroll')).toBe('needs_enroll');
  });
});

describe('background: reminder alarms re-armed on start', () => {
  it('arms a stored reminder whose alarm is missing after an install or update', async () => {
    const pending = reminderFactory.build({ id: 'r1' });
    getRemindersMock.mockResolvedValue([pending]);
    chromeMock.alarms.getAll.mockResolvedValue([]);

    fireInstalled();

    await vi.waitFor(() => {
      expect(chromeMock.alarms.create).toHaveBeenCalledWith('reminder-r1', {
        when: new Date(pending.dueDate).getTime(),
      });
    });
  });

  it('arms a stored reminder whose alarm is missing after a browser start', async () => {
    const pending = reminderFactory.build({ id: 'r2' });
    getRemindersMock.mockResolvedValue([pending]);
    chromeMock.alarms.getAll.mockResolvedValue([]);

    fireStartup();

    await vi.waitFor(() => {
      expect(chromeMock.alarms.create).toHaveBeenCalledWith('reminder-r2', expect.any(Object));
    });
  });

  it('leaves an alarm Chrome kept untouched, so it cannot fire twice', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r3' })]);
    chromeMock.alarms.getAll.mockResolvedValue([{ name: 'reminder-r3' }]);

    fireStartup();

    // The reconcile's own record proves it ran to completion and classified r3 as armed.
    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'reconciled',
        detail: 're-armed 0 of 1 pending',
      });
    });
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  // An update applied at launch fires both events.
  it('runs one reconcile when install and startup fire together', async () => {
    getRemindersMock.mockResolvedValue([reminderFactory.build({ id: 'r4' })]);
    chromeMock.alarms.getAll.mockResolvedValue([]);

    fireInstalled();
    fireStartup();

    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'reconciled' })
      );
    });
    await flushAsync();
    expect(chromeMock.alarms.getAll).toHaveBeenCalledTimes(1);
    expect(chromeMock.alarms.create).toHaveBeenCalledTimes(1);
  });

  it('leaves a trace when the reconcile itself fails', async () => {
    chromeMock.alarms.getAll.mockRejectedValueOnce(new Error('alarms unavailable'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    fireStartup();

    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'failed',
        detail: 'reconcile: alarms unavailable',
      });
    });
    expect(errorLog).toHaveBeenCalledWith(
      'Could not reconcile reminder alarms on start',
      expect.any(Error)
    );
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  // Chrome drops a one-shot alarm before dispatching it, so getAll() no longer lists a fire in
  // flight; a startup reconcile that re-armed it would deliver the reminder twice.
  it('does not re-arm a reminder whose fire is still in flight', async () => {
    const firing = reminderFactory.build({
      id: 'r5',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
    });
    const alsoOverdue = reminderFactory.build({
      id: 'r6',
      dueDate: new Date(Date.now() - 60_000).toISOString(),
    });
    getRemindersMock.mockResolvedValue([firing, alsoOverdue]);
    chromeMock.alarms.getAll.mockResolvedValue([]);
    let finishNotify = (): void => {};
    chromeMock.notifications.create.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishNotify = () => resolve('id');
      })
    );

    fireAlarm({ name: 'reminder-r5' });
    await vi.waitFor(() => expect(chromeMock.notifications.create).toHaveBeenCalled());
    fireStartup();
    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'reconciled',
        detail: 're-armed 1 of 2 pending',
      });
    });
    finishNotify();

    await vi.waitFor(() => expect(setRemindersMock).toHaveBeenCalled());
    expect(chromeMock.alarms.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.alarms.create).toHaveBeenCalledWith('reminder-r6', expect.any(Object));
  });
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
    const reminder = reminderFactory.build({ id: 'r2', text: 'Stretch', completed: false });
    getRemindersMock.mockResolvedValue([reminder]);

    fireButton('reminder-r2', 0);

    await vi.waitFor(() => {
      const saved = setRemindersMock.mock.calls[0][0] as Reminder[];
      const updated = saved.find((r) => r.id === 'r2');
      expect(updated?.completed).toBe(true);
    });
    expect(recordActivityMock).toHaveBeenCalledWith({
      event: 'done',
      reminderId: 'r2',
      text: 'Stretch',
    });
  });

  it('does not arm the snooze wake when the write did not persist', async () => {
    const reminder = reminderFactory.build({
      id: 'r6',
      completed: false,
      dueDate: new Date(Date.now() - 1000).toISOString(),
    });
    getRemindersMock.mockResolvedValue([reminder]);
    setRemindersMock.mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    fireButton('reminder-r6', 1);

    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r6',
        text: reminder.text,
        detail: 'snooze: not persisted',
      });
    });
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('records a Done that did not persist', async () => {
    const reminder = reminderFactory.build({ id: 'r6', text: 'Stretch' });
    getRemindersMock.mockResolvedValue([reminder]);
    setRemindersMock.mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    fireButton('reminder-r6', 0);

    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r6',
        text: 'Stretch',
        detail: 'done: not persisted',
      });
    });
  });

  it('records a button whose lookup failed, with only the id', async () => {
    getRemindersMock.mockRejectedValueOnce(new Error('storage gone'));
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    fireButton('reminder-r8', 0);

    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r8',
        detail: 'button 0: storage gone',
      });
    });
  });

  it('records a snooze wake that could not be armed', async () => {
    const reminder = reminderFactory.build({ id: 'r7', text: 'Stretch' });
    getRemindersMock.mockResolvedValue([reminder]);
    chromeMock.alarms.create.mockRejectedValueOnce(new Error('alarm limit'));
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    fireButton('reminder-r7', 1);

    await vi.waitFor(() => {
      expect(recordActivityMock).toHaveBeenCalledWith({
        event: 'failed',
        reminderId: 'r7',
        text: 'Stretch',
        detail: 'button 1: alarm limit',
      });
    });
  });

  // The lookup read and the locked read are separate; a pull can land between them.
  it('keeps a reminder that arrived between the lookup and the Done write', async () => {
    const reminder = reminderFactory.build({ id: 'r2', completed: false });
    const pulled = reminderFactory.build({ id: 'pulled' });
    getRemindersMock.mockResolvedValueOnce([reminder]);
    getRemindersMock.mockResolvedValue([reminder, pulled]);

    fireButton('reminder-r2', 0);

    await vi.waitFor(() => {
      const saved = setRemindersMock.mock.calls[0][0] as Reminder[];
      expect(saved.map((r) => r.id)).toEqual(['r2', 'pulled']);
    });
  });

  it('keeps a reminder that arrived between the lookup and the Snooze write', async () => {
    const reminder = reminderFactory.build({
      id: 'r3',
      completed: false,
      dueDate: new Date(Date.now() - 1000).toISOString(),
    });
    const pulled = reminderFactory.build({ id: 'pulled' });
    getRemindersMock.mockResolvedValueOnce([reminder]);
    getRemindersMock.mockResolvedValue([reminder, pulled]);

    fireButton('reminder-r3', 1);

    await vi.waitFor(() => {
      const saved = setRemindersMock.mock.calls[0][0] as Reminder[];
      expect(saved.map((r) => r.id)).toEqual(['r3', 'pulled']);
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
    expect(recordActivityMock).toHaveBeenCalledWith({
      event: 'snoozed',
      reminderId: 'r3',
      text: reminder.text,
      detail: expect.stringMatching(/^until \d{4}-/),
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

// The Settings test notification carries a reminder id nothing is stored under.
describe('background: the test notification', () => {
  it.each([
    ['Done', 0],
    ['Snooze', 1],
  ])('clears it on %s without writing or arming', async (_label, buttonIndex) => {
    getRemindersMock.mockResolvedValue([]);

    fireButton('reminder-test', buttonIndex);

    await vi.waitFor(() => {
      expect(chromeMock.notifications.clear).toHaveBeenCalledWith('reminder-test');
    });
    expect(setRemindersMock).not.toHaveBeenCalled();
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

it('points the uninstall url at the feedback page with the manifest version', () => {
  expect(uninstallUrl).toBe('https://cuewise.app/uninstall/?v=9.9.9');
});
