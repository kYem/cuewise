import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  buildExtension,
  copyDist,
  launchExtension,
  openNewTab,
  tempProfileDir,
} from './extension-harness';

const HABIT = {
  id: 'e2e-habit',
  text: 'Habit probe',
  dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
  completed: false,
  notified: false,
  recurring: { frequency: 'interval', intervalMinutes: 60 },
};

let extensionDir: string;
let profileDir: string;

test.beforeAll(() => {
  buildExtension();
  extensionDir = copyDist();
  profileDir = tempProfileDir();
});

test.afterAll(() => {
  rmSync(extensionDir, { recursive: true, force: true });
  rmSync(profileDir, { recursive: true, force: true });
});

test('ticking a habit pill records the day in habitHistory', async () => {
  test.setTimeout(60_000);
  const launched = await launchExtension({ extensionDir, profileDir });
  await launched.worker.evaluate(async (habit) => {
    await chrome.storage.local.set({ reminders: [habit] });
  }, HABIT);

  const page = await openNewTab(launched);
  await page.getByRole('button', { name: /reminders\. Click to expand/ }).click();
  await page.getByRole('button', { name: `Mark ${HABIT.text} done` }).click();

  await expect(async () => {
    const days = await launched.worker.evaluate(
      async () => (await chrome.storage.local.get('habitHistory')).habitHistory ?? []
    );
    expect(days).toEqual([expect.objectContaining({ reminderId: HABIT.id, count: 1 })]);
  }).toPass({ timeout: 5_000 });
  await launched.context.close();
});
