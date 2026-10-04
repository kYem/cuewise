import type { Reminder } from '@cuewise/shared';
import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { useReminderPromptStore } from '../../stores/reminder-prompt-store';
import { useReminderStore } from '../../stores/reminder-store';

export const FIRED_AT = '2026-10-04T09:00:00.000Z';

export const stretch = reminderFactory.build({ id: 'r1', text: 'Stretch', completed: false });

export const water = recurringReminderFactory.build({
  id: 'r2',
  text: 'Drink water',
  recurring: { frequency: 'daily' },
});

/** The given reminders in the store, each with a prompt from a fire that left it as it is. */
export function firedReminders(...reminders: Reminder[]): void {
  useReminderStore.setState({ reminders });
  useReminderPromptStore.setState({
    prompts: reminders.map((r) => ({ reminderId: r.id, firedAt: FIRED_AT, dueDate: r.dueDate })),
    initialize: async () => {},
  });
}

/** Moves the browser's visibility, as switching to or from this tab does. */
export function setTabVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}
