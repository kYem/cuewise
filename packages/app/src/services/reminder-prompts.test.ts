import { getStorage, logger } from '@cuewise/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addReminderPrompt,
  REMINDER_PROMPTS_KEY,
  readReminderPrompts,
  removeReminderPrompt,
} from './reminder-prompts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reminder prompts', () => {
  it('records a fired reminder with the time it fired', async () => {
    await addReminderPrompt('r1', new Date('2026-10-04T09:00:00.000Z'));

    expect(await readReminderPrompts()).toEqual([
      { reminderId: 'r1', firedAt: '2026-10-04T09:00:00.000Z' },
    ]);
  });

  it('keeps one prompt per reminder, from its latest fire', async () => {
    await addReminderPrompt('r1', new Date('2026-10-04T09:00:00.000Z'));
    await addReminderPrompt('r2', new Date('2026-10-04T09:01:00.000Z'));
    await addReminderPrompt('r1', new Date('2026-10-04T10:00:00.000Z'));

    expect(await readReminderPrompts()).toEqual([
      { reminderId: 'r2', firedAt: '2026-10-04T09:01:00.000Z' },
      { reminderId: 'r1', firedAt: '2026-10-04T10:00:00.000Z' },
    ]);
  });

  it('drops only the answered reminder', async () => {
    await addReminderPrompt('r1', new Date('2026-10-04T09:00:00.000Z'));
    await addReminderPrompt('r2', new Date('2026-10-04T09:01:00.000Z'));

    await removeReminderPrompt('r1');

    expect((await readReminderPrompts()).map((p) => p.reminderId)).toEqual(['r2']);
  });

  it('answers no prompts when the stored value is not a prompt list', async () => {
    await chrome.storage.local.set({ [REMINDER_PROMPTS_KEY]: 'garbage' });

    expect(await readReminderPrompts()).toEqual([]);
  });

  it('leaves the stored prompts alone when they cannot be read', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await addReminderPrompt('r1', new Date('2026-10-04T09:00:00.000Z'));
    vi.spyOn(getStorage(), 'getMany').mockResolvedValueOnce(null);

    await addReminderPrompt('r2');

    expect((await readReminderPrompts()).map((p) => p.reminderId)).toEqual(['r1']);
  });

  it('rejects a read that fails, rather than answering no prompts', async () => {
    vi.spyOn(getStorage(), 'getMany').mockResolvedValueOnce(null);

    await expect(readReminderPrompts()).rejects.toThrow('Could not read the reminder prompts');
  });

  it('logs rather than throws when a prompt cannot be stored', async () => {
    const error = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(getStorage(), 'set').mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    await expect(addReminderPrompt('r1')).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith('Could not update the reminder prompts', expect.anything());
  });
});
