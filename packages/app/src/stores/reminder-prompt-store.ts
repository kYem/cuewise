import { create } from 'zustand';
import {
  REMINDER_PROMPTS_KEY,
  type ReminderPrompt,
  readReminderPrompts,
} from '../services/reminder-prompts';
import { createStorageObserver, sameEntities } from './storage-changes';

interface ReminderPromptState {
  /** Fired reminders still waiting for an answer on this device, oldest first. */
  prompts: ReminderPrompt[];
  initialize: () => Promise<void>;
}

export const useReminderPromptStore = create<ReminderPromptState>((set, get) => {
  // Every open tab watches the same key: answering in one, or on the notification, empties it here.
  const observer = createStorageObserver('reminder prompts', [REMINDER_PROMPTS_KEY], async () => {
    const prompts = await readReminderPrompts();
    if (!sameEntities(get().prompts, prompts)) {
      set({ prompts });
    }
  });

  return {
    prompts: [],
    initialize: () => observer.reconcile(),
  };
});
