import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
  test,
  type Worker,
} from '@playwright/test';

// ENG-124: one reminder through its whole life in the REAL built extension — added from the
// page, fired by the service worker, snoozed from the page, re-armed after a staged extension
// update, completed from the page — asserted through the activity log it leaves behind, then
// printed so the run itself reads as the story:
//   pnpm --filter @cuewise/browser-extension exec playwright test e2e/reminder-lifecycle.spec.ts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const EXTENSION_DIST = path.join(EXTENSION_ROOT, 'dist');
const REMINDER_TEXT = 'Lifecycle probe';
const FIRE_IN_SECONDS = 6;

interface ActivityEntry {
  at: string;
  realm: 'worker' | 'page';
  event: string;
  reminderId?: string;
  text?: string;
  detail?: string;
}

let extensionDir: string;
let profileDir: string;
let extensionId: string;

test.beforeAll(() => {
  execFileSync('pnpm', ['--filter', '@cuewise/browser-extension', 'build'], {
    cwd: EXTENSION_ROOT,
    stdio: 'inherit',
  });
  extensionDir = mkdtempSync(path.join(tmpdir(), 'cuewise-ext-'));
  cpSync(EXTENSION_DIST, extensionDir, { recursive: true });
  profileDir = mkdtempSync(path.join(tmpdir(), 'cuewise-profile-'));
});

test.afterAll(() => {
  rmSync(extensionDir, { recursive: true, force: true });
  rmSync(profileDir, { recursive: true, force: true });
});

async function launch(): Promise<{ context: BrowserContext; worker: Worker }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  extensionId = new URL(worker.url()).host;
  return { context, worker };
}

// The welcome dialog shows once per profile, so only the first open has a Skip to click.
async function openRemindersPanel(
  context: BrowserContext,
  { firstVisit }: { firstVisit: boolean }
): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  if (firstVisit) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  await page.getByRole('button', { name: /reminders\. Click to expand/ }).click();
  return page;
}

// The form parses `${date}T${time}` as local time, and the time input accepts seconds.
function localDateAndTime(when: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
  return { date, time };
}

async function readActivity(worker: Worker): Promise<ActivityEntry[]> {
  return worker.evaluate(
    async () =>
      ((await chrome.storage.local.get('reminderActivity')).reminderActivity ??
        []) as ActivityEntry[]
  );
}

async function findReminderId(worker: Worker, text: string): Promise<string> {
  let id: string | undefined;
  await expect(async () => {
    id = await worker.evaluate(async (wanted) => {
      const { reminders = [] } = await chrome.storage.local.get('reminders');
      return (reminders as { id: string; text: string }[]).find((r) => r.text === wanted)?.id;
    }, text);
    expect(id, `reminder "${text}" was not saved`).toBeDefined();
  }).toPass({ timeout: 5_000 });
  return id as string;
}

async function waitForEvent(worker: Worker, reminderId: string, event: string, timeout: number) {
  await expect(async () => {
    const log = await readActivity(worker);
    expect(log.some((e) => e.reminderId === reminderId && e.event === event)).toBe(true);
  }).toPass({ timeout });
}

function bumpManifestVersion(): void {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const [major, minor, patch] = String(manifest.version).split('.').map(Number);
  manifest.version = `${major}.${minor}.${patch + 1}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function eventsInOrder(log: ActivityEntry[], expected: string[]): boolean {
  let next = 0;
  for (const entry of log) {
    if (entry.event === expected[next]) {
      next += 1;
    }
  }
  return next === expected.length;
}

function step(message: string): void {
  console.log(`[lifecycle] ${message}`);
}

function printTrace(log: ActivityEntry[]): void {
  console.log('\nReminder activity trace:');
  for (const e of log) {
    const subject = e.text ?? e.reminderId ?? '';
    console.log(
      `  ${e.at}  ${e.realm.padEnd(6)}  ${e.event.padEnd(10)}  ${subject}  ${e.detail ?? ''}`
    );
  }
  console.log('');
}

test('a reminder is armed, fired, snoozed, re-armed after an update, and completed', async () => {
  test.setTimeout(120_000);

  const first = await launch();
  const page = await openRemindersPanel(first.context, { firstVisit: true });
  step(`add "${REMINDER_TEXT}" due in ${FIRE_IN_SECONDS}s from the page`);
  await page.getByRole('button', { name: 'Add reminder' }).click();
  await page.getByRole('button', { name: 'Custom' }).click();
  const { date, time } = localDateAndTime(new Date(Date.now() + FIRE_IN_SECONDS * 1000));
  await page.locator('#reminder-text').fill(REMINDER_TEXT);
  await page.locator('#reminder-date').fill(date);
  await page.locator('#reminder-time').fill(time);
  await page.getByRole('dialog').getByRole('button', { name: 'Add reminder' }).click();

  const reminderId = await findReminderId(first.worker, REMINDER_TEXT);
  step('wait for the page to arm it');
  await waitForEvent(first.worker, reminderId, 'armed', 5_000);
  step('wait for the service worker to fire it');
  await waitForEvent(first.worker, reminderId, 'fired', (FIRE_IN_SECONDS + 20) * 1000);

  step('snooze it 5m from the page');
  await page.getByRole('button', { name: '5m', exact: true }).click();
  await waitForEvent(first.worker, reminderId, 'cancelled', 5_000);
  await first.context.close();

  step('stage an extension update and relaunch');
  bumpManifestVersion();
  const second = await launch();
  await expect(async () => {
    const log = await readActivity(second.worker);
    expect(
      log.some((e) => e.event === 'reconciled' && e.detail === 're-armed 1 of 1 pending')
    ).toBe(true);
  }).toPass({ timeout: 10_000 });

  const pageAfterUpdate = await openRemindersPanel(second.context, { firstVisit: false });
  step('complete it from the page');
  await pageAfterUpdate.getByRole('button', { name: /^Mark .*done$/ }).click();
  await expect(async () => {
    const log = await readActivity(second.worker);
    const cancellations = log.filter((e) => e.reminderId === reminderId && e.event === 'cancelled');
    expect(cancellations.length).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 5_000 });

  const log = await readActivity(second.worker);
  printTrace(log);
  expect(
    eventsInOrder(log, ['armed', 'fired', 'cancelled', 'armed', 'reconciled', 'cancelled'])
  ).toBe(true);
  await second.context.close();
});
