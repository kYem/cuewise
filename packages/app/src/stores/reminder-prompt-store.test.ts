import { configurePlatform } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { addReminderPrompt, removeReminderPrompt } from '../services/reminder-prompts';
import { settleQueuedWork } from './__fixtures__/storage-changes.fixtures';
import { useReminderPromptStore } from './reminder-prompt-store';

const DUE = '2026-10-04T09:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  configurePlatform({ storage: new LocalStorageKeyValueStore() });
  useReminderPromptStore.setState({ prompts: [] });
});

describe('useReminderPromptStore', () => {
  it('loads the prompts already waiting on this device', async () => {
    await addReminderPrompt('r1', DUE, { firedAt: new Date(DUE) });

    await useReminderPromptStore.getState().initialize();

    expect(useReminderPromptStore.getState().prompts).toEqual([
      { reminderId: 'r1', firedAt: DUE, dueDate: DUE },
    ]);
  });

  it('picks up a prompt raised after it loaded', async () => {
    await useReminderPromptStore.getState().initialize();

    await addReminderPrompt('r1', DUE);
    await settleQueuedWork();

    expect(useReminderPromptStore.getState().prompts.map((p) => p.reminderId)).toEqual(['r1']);
  });

  it('drops a prompt answered somewhere else', async () => {
    await addReminderPrompt('r1', DUE);
    await useReminderPromptStore.getState().initialize();

    await removeReminderPrompt('r1');
    await settleQueuedWork();

    expect(useReminderPromptStore.getState().prompts).toEqual([]);
  });
});
