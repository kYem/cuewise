// Fired reminders still waiting for an answer on this device, for the in-app card. Device-local:
// each device fires its own wakes, so a prompt raised here must not appear anywhere else.

import { getStorage, logger, type Reminder } from '@cuewise/shared';
import { withCollectionLock } from '@cuewise/storage';

export const REMINDER_PROMPTS_KEY = 'reminderPrompts';
const REMINDER_PROMPTS_LIMIT = 20;

export interface ReminderPrompt {
  reminderId: string;
  firedAt: string;
  /** The due date the fire left behind; a reminder answered or edited anywhere moves off it. */
  dueDate: string;
}

function isPrompt(value: unknown): value is ReminderPrompt {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prompt = value as Partial<ReminderPrompt>;
  return (
    typeof prompt.reminderId === 'string' &&
    typeof prompt.firedAt === 'string' &&
    typeof prompt.dueDate === 'string'
  );
}

/** Null when the read itself failed; an unreadable or malformed stored value reads as none. */
async function readStoredPrompts(): Promise<ReminderPrompt[] | null> {
  const stored = await getStorage().getMany([REMINDER_PROMPTS_KEY], 'local');
  if (stored === null) {
    return null;
  }
  const slot = stored[REMINDER_PROMPTS_KEY];
  if (!slot?.readable || !Array.isArray(slot.value)) {
    return [];
  }
  return slot.value.filter(isPrompt);
}

/** The prompts as stored, oldest first. Rejects on a failed read rather than answering none. */
export async function readReminderPrompts(): Promise<ReminderPrompt[]> {
  const prompts = await readStoredPrompts();
  if (prompts === null) {
    throw new Error('Could not read the reminder prompts');
  }
  return prompts;
}

/**
 * Never throws: a prompt is a convenience on top of the notification, not the reminder itself.
 * Answers whether the change was stored.
 */
async function updatePrompts(
  mutate: (prompts: ReminderPrompt[]) => ReminderPrompt[]
): Promise<boolean> {
  try {
    return await withCollectionLock('reminderPrompts', async () => {
      const current = await readStoredPrompts();
      // A failed read must not become a list holding only this change.
      if (current === null) {
        logger.error('Could not read the reminder prompts; change dropped');
        return false;
      }
      const next = mutate(current).slice(-REMINDER_PROMPTS_LIMIT);
      const result = await getStorage().set(REMINDER_PROMPTS_KEY, next, 'local');
      if (!result.success) {
        logger.warn('Could not update the reminder prompts', { error: result.error });
      }
      return result.success;
    });
  } catch (error) {
    logger.error('Could not update the reminder prompts', error);
    return false;
  }
}

/**
 * Raises the card for a reminder that just fired, replacing any earlier prompt for it.
 * `keepNewerFire` keeps one raised since `dueDate` came due: a catch-up sweep must not overwrite
 * the fire that beat it there, but must still replace a prompt left from before an edit.
 */
export function addReminderPrompt(
  reminderId: string,
  dueDate: string,
  { firedAt = new Date(), keepNewerFire = false }: { firedAt?: Date; keepNewerFire?: boolean } = {}
): Promise<boolean> {
  return updatePrompts((prompts) => {
    const raisedSinceDue = (p: ReminderPrompt) =>
      p.reminderId === reminderId && Date.parse(p.firedAt) >= Date.parse(dueDate);
    if (keepNewerFire && prompts.some(raisedSinceDue)) {
      return prompts;
    }
    return [
      ...prompts.filter((p) => p.reminderId !== reminderId),
      { reminderId, firedAt: firedAt.toISOString(), dueDate },
    ];
  });
}

/** Whether the reminder still waits on the answer this prompt asks for. */
export function promptIsLive(prompt: ReminderPrompt, reminder: Reminder | undefined): boolean {
  if (reminder === undefined || reminder.completed || reminder.paused === true) {
    return false;
  }
  return reminder.dueDate === prompt.dueDate;
}

export function removeReminderPrompt(reminderId: string): Promise<boolean> {
  return updatePrompts((prompts) => prompts.filter((p) => p.reminderId !== reminderId));
}
