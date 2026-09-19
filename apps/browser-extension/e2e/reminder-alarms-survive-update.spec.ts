import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test, type Worker } from '@playwright/test';

// ENG-118: chrome.alarms are cleared whenever the extension updates (documented), so a
// reminder armed before a release must be re-armed by the service worker afterwards.
// Drives the REAL built extension through a restart and a staged update, on a copy of
// dist so the manifest version can be bumped without touching the build.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const EXTENSION_DIST = path.join(EXTENSION_ROOT, 'dist');
const ONE_HOUR_MS = 60 * 60 * 1000;

const REMINDER_ID = 'e2e-pending';
const ALARM_NAME = `reminder-${REMINDER_ID}`;

let extensionDir: string;
let profileDir: string;

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

// Same profile every launch: that is what makes the second launch a restart or an update
// rather than a fresh install. Headed, as MV3 service workers don't register headless here.
async function launch(): Promise<{ context: BrowserContext; worker: Worker }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return { context, worker };
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

function bumpManifestVersion(): string {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const [major, minor, patch] = String(manifest.version).split('.').map(Number);
  manifest.version = `${major}.${minor}.${patch + 1}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest.version;
}

test('a pending reminder is still armed after a browser restart', async () => {
  const first = await launch();
  await seedPendingReminderAndArm(first.worker);
  await first.context.close();

  const second = await launch();
  await expect(async () => {
    expect(await readAlarm(second.worker)).not.toBeNull();
  }).toPass({ timeout: 5000 });
  await second.context.close();
});

test('a pending reminder is still armed after an extension update', async () => {
  const first = await launch();
  await seedPendingReminderAndArm(first.worker);
  const versionBefore = await readVersion(first.worker);
  await first.context.close();

  const versionAfter = bumpManifestVersion();
  expect(versionAfter).not.toBe(versionBefore);

  const second = await launch();
  expect(await readVersion(second.worker)).toBe(versionAfter);
  await expect(async () => {
    expect(await readAlarm(second.worker)).not.toBeNull();
  }).toPass({ timeout: 5000 });
  await second.context.close();
});
