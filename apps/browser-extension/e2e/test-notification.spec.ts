import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test, type Worker } from '@playwright/test';

// ENG-119: the Settings "Send test" button creates a real chrome.notifications entry in the
// REAL built extension — the closest an automated check gets to the OS drawing it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const EXTENSION_DIST = path.join(EXTENSION_ROOT, 'dist');

let profileDir: string;

test.beforeAll(() => {
  execFileSync('pnpm', ['--filter', '@cuewise/browser-extension', 'build'], {
    cwd: EXTENSION_ROOT,
    stdio: 'inherit',
  });
  profileDir = mkdtempSync(path.join(tmpdir(), 'cuewise-profile-'));
});

test.afterAll(() => {
  rmSync(profileDir, { recursive: true, force: true });
});

async function launch(): Promise<{ context: BrowserContext; worker: Worker }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return { context, worker };
}

async function shownNotificationIds(worker: Worker): Promise<string[]> {
  return worker.evaluate(async () => Object.keys(await chrome.notifications.getAll()));
}

test('Send test creates a reminder-shaped notification', async () => {
  const { context, worker } = await launch();
  const extensionId = new URL(worker.url()).host;
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
