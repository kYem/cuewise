import * as storage from '@cuewise/storage';
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
  it('disables recurring and clears the alarm when pausing', async () => {
    const store = useReminderStore.getState();
    await store.addReminder('Move', new Date(Date.now() + 60_000), {
      frequency: 'interval',
      enabled: true,
      intervalMinutes: 30,
    });
    const id = useReminderStore.getState().reminders[0].id;

    await useReminderStore.getState().setReminderPaused(id, true);

    expect(useReminderStore.getState().reminders[0].recurring?.enabled).toBe(false);
    expect(alarmsMock.clear).toHaveBeenCalledWith(`reminder-${id}`);
  });

  it('re-enables recurring and recreates the alarm when resuming', async () => {
    const store = useReminderStore.getState();
    await store.addReminder('Move', new Date(Date.now() + 60_000), {
      frequency: 'interval',
      enabled: true,
      intervalMinutes: 30,
    });
    const id = useReminderStore.getState().reminders[0].id;
    await useReminderStore.getState().setReminderPaused(id, true);
    alarmsMock.create.mockClear();

    await useReminderStore.getState().setReminderPaused(id, false);

    expect(useReminderStore.getState().reminders[0].recurring?.enabled).toBe(true);
    expect(alarmsMock.create).toHaveBeenCalledWith(`reminder-${id}`, expect.any(Object));
  });
});
