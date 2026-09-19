import { expect, test, type Worker } from '@playwright/test';
import { buildExtension, launchExtension } from './extension-harness';

// ENG-119: the Settings "Send test" button creates a real chrome.notifications entry in the
// REAL built extension — the closest an automated check gets to the OS drawing it.
test.beforeAll(() => {
  buildExtension();
});

async function shownNotificationIds(worker: Worker): Promise<string[]> {
  return worker.evaluate(async () => Object.keys(await chrome.notifications.getAll()));
}

test('Send test creates a reminder-shaped notification', async () => {
  const { context, worker, extensionId } = await launchExtension();
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();

  await page.goto(`chrome-extension://${extensionId}/index.html#settings`);
  await page.getByPlaceholder('Search settings…').fill('test notification');
  await page.getByRole('button', { name: 'Send test' }).click();

  await expect(page.getByText(/^Sent\./)).toBeVisible();
  await expect(async () => {
    expect(await shownNotificationIds(worker)).toContain('reminder-test');
  }).toPass({ timeout: 5_000 });

  await context.close();
});
