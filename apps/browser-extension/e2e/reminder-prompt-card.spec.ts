import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  addReminderFromPage,
  buildExtension,
  findReminderId,
  launchExtension,
  openNewTab,
  tempProfileDir,
  waitForEvent,
} from './extension-harness';

// ENG-140: the fire happens in the service worker, so the card appearing on the page proves the
// prompt crossed realms through storage, and Done proves it answers the way the notification does.
const REMINDER_TEXT = 'Card probe';
const FIRE_IN_SECONDS = 6;

let profileDir: string;

test.beforeAll(() => {
  buildExtension();
  profileDir = tempProfileDir();
});

test.afterAll(() => {
  rmSync(profileDir, { recursive: true, force: true });
});

test('a fired reminder raises the in-app card, and Done answers it', async () => {
  test.setTimeout(90_000);
  const session = await launchExtension({ profileDir });
  const page = await openNewTab(session);
  await addReminderFromPage(page, REMINDER_TEXT, FIRE_IN_SECONDS);
  // The card steps aside while the bell panel is open.
  await page.getByRole('button', { name: /reminders\. Click to collapse/ }).click();
  const reminderId = await findReminderId(session.worker, REMINDER_TEXT);
  await waitForEvent(session.worker, reminderId, 'fired', (FIRE_IN_SECONDS + 20) * 1000);

  const card = page.getByRole('region', { name: REMINDER_TEXT });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Done' }).click();

  await expect(card).toBeHidden();
  const done = await waitForEvent(session.worker, reminderId, 'done', 5_000);
  expect(done.realm).toBe('page');
  const state = await session.worker.evaluate(async (id) => {
    const { reminders = [] } = await chrome.storage.local.get('reminders');
    const notifications = await chrome.notifications.getAll();
    return {
      completed: (reminders as { id: string; completed: boolean }[]).find((r) => r.id === id)
        ?.completed,
      notificationOpen: `reminder-${id}` in notifications,
    };
  }, reminderId);
  expect(state).toEqual({ completed: true, notificationOpen: false });
  await session.context.close();
});
