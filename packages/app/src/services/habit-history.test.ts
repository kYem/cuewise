import { configurePlatform, logger, type Reminder } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { reminderFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetHabit, pruneExpiredHabitDays, recordHabitTick } from './habit-history';

vi.mock('@cuewise/storage', () => ({
  recordHabitDone: vi.fn(),
  removeHabitDays: vi.fn(),
  removeHabitDaysBefore: vi.fn(),
}));

const markMutated = vi.fn();
const markDeleted = vi.fn();
const markDeletedBulk = vi.fn();

const habit: Reminder = reminderFactory.build({
  id: 'h1',
  recurring: { frequency: 'interval', intervalMinutes: 60 },
});

const quotaError = {
  type: 'quota_exceeded',
  message: 'quota',
  key: 'habitHistory',
  area: 'local',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  configurePlatform({ syncSink: { markMutated, markDeleted, markDeletedBulk } });
  vi.mocked(storage.recordHabitDone).mockResolvedValue({
    result: { success: true },
    changedId: 'h1:2026-10-05',
    prunedIds: ['h1:2025-10-01'],
  });
  vi.mocked(storage.removeHabitDays).mockResolvedValue({
    result: { success: true },
    removedIds: ['h1:2026-10-04', 'h1:2026-10-05'],
  });
});

describe('recordHabitTick', () => {
  it('records the day the window opened and tells sync what changed', async () => {
    await recordHabitTick(habit, new Date(2026, 9, 5, 14));

    expect(storage.recordHabitDone).toHaveBeenCalledWith('h1', '2026-10-05');
    expect(markMutated).toHaveBeenCalledWith('habitHistory', 'h1:2026-10-05');
    expect(markDeletedBulk).toHaveBeenCalledWith('habitHistory', ['h1:2025-10-01']);
  });

  it('records an overnight window against the evening it opened', async () => {
    const overnight = reminderFactory.build({
      id: 'h1',
      recurring: {
        frequency: 'interval',
        intervalMinutes: 60,
        activeHours: { start: '22:00', end: '06:00' },
      },
    });

    await recordHabitTick(overnight, new Date(2026, 9, 5, 2));

    expect(storage.recordHabitDone).toHaveBeenCalledWith('h1', '2026-10-04');
  });

  it('records nothing for a calendar reminder', async () => {
    const daily = reminderFactory.build({ recurring: { frequency: 'daily' } });

    await recordHabitTick(daily, new Date(2026, 9, 5, 14));

    expect(storage.recordHabitDone).not.toHaveBeenCalled();
  });

  it('tells sync nothing when the write did not land', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(storage.recordHabitDone).mockResolvedValue({
      result: { success: false, error: quotaError },
      changedId: 'h1:2026-10-05',
      prunedIds: ['h1:2025-10-01'],
    });

    await recordHabitTick(habit, new Date(2026, 9, 5, 14));

    expect(error).toHaveBeenCalled();
    expect(markMutated).not.toHaveBeenCalled();
    expect(markDeletedBulk).not.toHaveBeenCalled();
  });

  it('logs rather than throws when the write rejects', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(storage.recordHabitDone).mockRejectedValue(new Error('quota'));

    await expect(recordHabitTick(habit, new Date(2026, 9, 5, 14))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    expect(markMutated).not.toHaveBeenCalled();
  });
});

describe('forgetHabit', () => {
  it('tombstones every removed day in one bulk mark', async () => {
    await forgetHabit('h1');

    expect(markDeletedBulk).toHaveBeenCalledTimes(1);
    expect(markDeletedBulk).toHaveBeenCalledWith('habitHistory', [
      'h1:2026-10-04',
      'h1:2026-10-05',
    ]);
    expect(markDeleted).not.toHaveBeenCalled();
  });

  it('tells sync nothing when the removal did not land', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(storage.removeHabitDays).mockResolvedValue({
      result: { success: false, error: quotaError },
      removedIds: ['h1:2026-10-04'],
    });

    await forgetHabit('h1');

    expect(markDeletedBulk).not.toHaveBeenCalled();
  });

  it('logs rather than throws when the removal rejects', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(storage.removeHabitDays).mockRejectedValue(new Error('unreadable'));

    await expect(forgetHabit('h1')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

describe('pruneExpiredHabitDays', () => {
  it('removes days a year and a day old and tombstones them', async () => {
    vi.mocked(storage.removeHabitDaysBefore).mockResolvedValue({
      result: { success: true },
      removedIds: ['h2:2025-10-01'],
    });

    await pruneExpiredHabitDays(new Date(2026, 9, 5, 14));

    expect(storage.removeHabitDaysBefore).toHaveBeenCalledWith('2025-10-05');
    expect(markDeletedBulk).toHaveBeenCalledWith('habitHistory', ['h2:2025-10-01']);
  });

  it('logs rather than throws when the sweep rejects', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(storage.removeHabitDaysBefore).mockRejectedValue(new Error('unreadable'));

    await expect(pruneExpiredHabitDays(new Date(2026, 9, 5, 14))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    expect(markDeletedBulk).not.toHaveBeenCalled();
  });
});
