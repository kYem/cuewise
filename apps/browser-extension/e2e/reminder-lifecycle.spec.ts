import { rmSync } from 'node:fs';
import type { ReminderActivityEntry } from '@cuewise/app/reminder-activity';
import { expect, test } from '@playwright/test';
import {
  addReminderFromPage,
  buildExtension,
  bumpManifestVersion,
  copyDist,
  findReminderId,
  launchExtension,
  openNewTab,
  readActivity,
  tempProfileDir,
  waitForEvent,
} from './extension-harness';

// ENG-124: asserted through the activity log the extension leaves behind, then printed as the
// run's story. Unpacked extensions have no 30s alarm clamp, so a reminder can be due in seconds.
const REMINDER_TEXT = 'Lifecycle probe';
const FIRE_IN_SECONDS = 6;

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

function launch() {
  return launchExtension({ extensionDir, profileDir });
}

function eventsInOrder(log: ReminderActivityEntry[], expected: string[]): boolean {
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

function printTrace(log: ReminderActivityEntry[]): void {
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
  const page = await openNewTab(first);
  step(`add "${REMINDER_TEXT}" due in ${FIRE_IN_SECONDS}s from the page`);
  await addReminderFromPage(page, REMINDER_TEXT, FIRE_IN_SECONDS);

  const reminderId = await findReminderId(first.worker, REMINDER_TEXT);
  step('wait for the page to arm it');
  const armed = await waitForEvent(first.worker, reminderId, 'armed', 5_000);
  expect(armed.realm).toBe('page');
  step('wait for the service worker to fire it');
  const fired = await waitForEvent(
    first.worker,
    reminderId,
    'fired',
    (FIRE_IN_SECONDS + 20) * 1000
  );
  expect(fired.realm).toBe('worker');

  step('snooze it 5m from the page');
  await page.getByRole('button', { name: 'Snooze 5 minutes' }).click();
  await waitForEvent(first.worker, reminderId, 'cancelled', 5_000);
  await first.context.close();

  step('stage an extension update and relaunch');
  bumpManifestVersion(extensionDir);
  const second = await launch();
  await expect(async () => {
    const reconciles = (await readActivity(second.worker)).filter(
      (e) => e.event === 'reconciled' && e.detail === 're-armed 1 of 1 pending'
    );
    expect(reconciles).toHaveLength(1);
  }).toPass({ timeout: 10_000 });

  const pageAfterUpdate = await openNewTab(second, { firstVisit: false });
  await pageAfterUpdate.getByRole('button', { name: /reminders\. Click to expand/ }).click();
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
