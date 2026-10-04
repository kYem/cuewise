import { getStorage, logger } from '@cuewise/shared';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addReminderPrompt,
  promptIsLive,
  REMINDER_PROMPTS_KEY,
  readReminderPrompts,
  removeReminderPrompt,
} from './reminder-prompts';

const DUE = '2026-10-04T09:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reminder prompts', () => {
  it('records a fired reminder with the time it fired and the due date it left', async () => {
    await addReminderPrompt('r1', DUE, { firedAt: new Date('2026-10-04T09:00:05.000Z') });

    expect(await readReminderPrompts()).toEqual([
      { reminderId: 'r1', firedAt: '2026-10-04T09:00:05.000Z', dueDate: DUE },
    ]);
  });

  it('keeps one prompt per reminder, from its latest fire', async () => {
    await addReminderPrompt('r1', DUE, { firedAt: new Date('2026-10-04T09:00:00.000Z') });
    await addReminderPrompt('r2', DUE, { firedAt: new Date('2026-10-04T09:01:00.000Z') });
    await addReminderPrompt('r1', DUE, { firedAt: new Date('2026-10-04T10:00:00.000Z') });

    expect((await readReminderPrompts()).map((p) => [p.reminderId, p.firedAt])).toEqual([
      ['r2', '2026-10-04T09:01:00.000Z'],
      ['r1', '2026-10-04T10:00:00.000Z'],
    ]);
  });

  it('keeps a prompt the fire raised since this occurrence came due', async () => {
    await addReminderPrompt('r1', '2026-10-05T09:00:00.000Z', {
      firedAt: new Date('2026-10-04T09:00:02.000Z'),
    });

    await addReminderPrompt('r1', DUE, { keepNewerFire: true });

    expect((await readReminderPrompts()).map((p) => p.dueDate)).toEqual([
      '2026-10-05T09:00:00.000Z',
    ]);
  });

  it('still replaces a prompt left from before the occurrence came due', async () => {
    await addReminderPrompt('r1', '2026-10-04T08:00:00.000Z', {
      firedAt: new Date('2026-10-04T08:00:01.000Z'),
    });

    await addReminderPrompt('r1', DUE, { keepNewerFire: true });

    expect((await readReminderPrompts()).map((p) => p.dueDate)).toEqual([DUE]);
  });

  it('drops only the answered reminder', async () => {
    await addReminderPrompt('r1', DUE);
    await addReminderPrompt('r2', DUE);

    await removeReminderPrompt('r1');

    expect((await readReminderPrompts()).map((p) => p.reminderId)).toEqual(['r2']);
  });

  it('answers no prompts when the stored value is not a prompt list', async () => {
    await chrome.storage.local.set({ [REMINDER_PROMPTS_KEY]: 'garbage' });

    expect(await readReminderPrompts()).toEqual([]);
  });

  it('leaves the stored prompts alone when they cannot be read', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await addReminderPrompt('r1', DUE);
    vi.spyOn(getStorage(), 'getMany').mockResolvedValueOnce(null);

    await addReminderPrompt('r2', DUE);

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

    await expect(addReminderPrompt('r1', DUE)).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith('Could not update the reminder prompts', expect.anything());
  });
});

describe('promptIsLive', () => {
  const prompt = { reminderId: 'r1', firedAt: DUE, dueDate: DUE };

  it('holds while the reminder is just as the fire left it', () => {
    expect(promptIsLive(prompt, reminderFactory.build({ id: 'r1', dueDate: DUE }))).toBe(true);
  });

  it('lapses once an answer anywhere moved the due date on', () => {
    const answered = recurringReminderFactory.build({
      id: 'r1',
      dueDate: '2026-10-05T09:00:00.000Z',
    });

    expect(promptIsLive(prompt, answered)).toBe(false);
  });

  it('lapses for a reminder that is done, paused or gone', () => {
    expect(promptIsLive(prompt, reminderFactory.build({ dueDate: DUE, completed: true }))).toBe(
      false
    );
    expect(
      promptIsLive(prompt, recurringReminderFactory.build({ dueDate: DUE, paused: true }))
    ).toBe(false);
    expect(promptIsLive(prompt, undefined)).toBe(false);
  });
});
