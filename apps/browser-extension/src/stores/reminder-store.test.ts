import * as storage from '@cuewise/storage';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from './reminder-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getReminders: vi.fn(),
  setReminders: vi.fn(),
}));

// Mock toast store
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

const getRemindersMock = vi.mocked(storage.getReminders);
const setRemindersMock = vi.mocked(storage.setReminders);

// chrome.storage is mocked globally in vitest.setup.ts; alarms are not, so add them here.
const alarmsMock = {
  create: vi.fn(() => Promise.resolve()),
  clear: vi.fn(() => Promise.resolve(true)),
};

beforeEach(() => {
  vi.clearAllMocks();
  getRemindersMock.mockResolvedValue([]);
  setRemindersMock.mockResolvedValue({ success: true });
  (chrome as unknown as { alarms: typeof alarmsMock }).alarms = alarmsMock;
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
    expect(alarmsMock.clear).toHaveBeenCalledWith(`reminder-${id}`);
  });

  it('unpauses the reminder and recreates the alarm when resuming', async () => {
    const store = useReminderStore.getState();
    await store.addReminder('Move', new Date(Date.now() + 60_000), {
      frequency: 'interval',
      intervalMinutes: 30,
    });
    const id = useReminderStore.getState().reminders[0].id;
    await useReminderStore.getState().setReminderPaused(id, true);
    alarmsMock.create.mockClear();

    const beforeResume = Date.now();
    await useReminderStore.getState().setReminderPaused(id, false);

    const resumed = useReminderStore.getState().reminders[0];
    expect(resumed.paused).toBe(false);
    // Resume advances dueDate to the next occurrence (now + interval), not a stale past time.
    expect(new Date(resumed.dueDate).getTime()).toBeGreaterThan(beforeResume);
    expect(alarmsMock.create).toHaveBeenCalledWith(`reminder-${id}`, expect.any(Object));
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
    expect(alarmsMock.create).not.toHaveBeenCalled();
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
    expect(alarmsMock.create).toHaveBeenCalledWith('reminder-r-edit', expect.any(Object));
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
    expect(alarmsMock.create).not.toHaveBeenCalledWith('reminder-paused-init', expect.any(Object));
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
});

describe('addReminder with an interval recurrence', () => {
  it('schedules the alarm at the reminder due date', async () => {
    const dueDate = new Date(Date.now() + 60_000);

    await useReminderStore.getState().addReminder('Move', dueDate, {
      frequency: 'interval',
      intervalMinutes: 30,
    });

    const id = useReminderStore.getState().reminders[0].id;
    expect(alarmsMock.create).toHaveBeenCalledWith(`reminder-${id}`, { when: dueDate.getTime() });
  });
});
