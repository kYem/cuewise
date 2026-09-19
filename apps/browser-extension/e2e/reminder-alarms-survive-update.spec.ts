import { rmSync } from 'node:fs';
import { expect, test, type Worker } from '@playwright/test';
import {
  buildExtension,
  bumpManifestVersion,
  copyDist,
  type ExtensionSession,
  launchExtension,
  readActivity,
  tempProfileDir,
} from './extension-harness';

// ENG-118: chrome.alarms are cleared whenever the extension updates (documented), so a reminder
// armed before a release must be re-armed by the service worker afterwards.
const ONE_HOUR_MS = 60 * 60 * 1000;
const REMINDER_ID = 'e2e-pending';
const ALARM_NAME = `reminder-${REMINDER_ID}`;

let extensionDir: string;
let profileDir: string;

test.beforeAll(() => {
  buildExtension();
  extensionDir = copyDist();
});

test.afterAll(() => {
  rmSync(extensionDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  profileDir = tempProfileDir();
});

test.afterEach(() => {
  rmSync(profileDir, { recursive: true, force: true });
});

// Every launch reconciles on start; seeding storage while that runs would be read by it.
async function launchAndSettle(expectedReconciles: number): Promise<ExtensionSession> {
  const session = await launchExtension({ extensionDir, profileDir });
  await expect(async () => {
    const log = await readActivity(session.worker);
    expect(log.filter((e) => e.event === 'reconciled')).toHaveLength(expectedReconciles);
  }).toPass({ timeout: 10_000 });
  return session;
}

async function seedPendingReminderAndArm(worker: Worker): Promise<void> {
  const dueDate = new Date(Date.now() + ONE_HOUR_MS).toISOString();
  await worker.evaluate(
    async ({ id, alarmName, dueDate }) => {
      await chrome.storage.local.set({
        reminders: [{ id, text: 'Stretch', dueDate, completed: false, notified: false }],
      });
      await chrome.alarms.create(alarmName, { when: new Date(dueDate).getTime() });
    },
    { id: REMINDER_ID, alarmName: ALARM_NAME, dueDate }
  );
  expect(await readAlarm(worker)).not.toBeNull();
}

async function readAlarm(worker: Worker): Promise<chrome.alarms.Alarm | null> {
  return worker.evaluate(async (name) => (await chrome.alarms.get(name)) ?? null, ALARM_NAME);
}

async function readVersion(worker: Worker): Promise<string> {
  return worker.evaluate(() => chrome.runtime.getManifest().version);
}

async function lastReconcile(worker: Worker): Promise<string | undefined> {
  const reconciles = (await readActivity(worker)).filter((e) => e.event === 'reconciled');
  return reconciles[reconciles.length - 1]?.detail;
}

test('a pending reminder is still armed after a browser restart', async () => {
  const first = await launchAndSettle(1);
  await seedPendingReminderAndArm(first.worker);
  await first.context.close();

  const second = await launchAndSettle(2);
  expect(await readAlarm(second.worker)).not.toBeNull();
  await second.context.close();
});

// The alarm's presence alone cannot tell "re-armed" from "never cleared": the reconcile's own
// record is what proves the fix ran, once.
test('a pending reminder is re-armed after an extension update', async () => {
  const first = await launchAndSettle(1);
  await seedPendingReminderAndArm(first.worker);
  const versionBefore = await readVersion(first.worker);
  await first.context.close();

  const versionAfter = bumpManifestVersion(extensionDir);
  expect(versionAfter).not.toBe(versionBefore);

  const second = await launchAndSettle(2);
  expect(await readVersion(second.worker)).toBe(versionAfter);
  expect(await readAlarm(second.worker)).not.toBeNull();
  expect(await lastReconcile(second.worker)).toBe('re-armed 1 of 1 pending');
  await second.context.close();
});
