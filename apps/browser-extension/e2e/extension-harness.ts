import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReminderActivityEntry } from '@cuewise/app/reminder-activity';
import { type BrowserContext, chromium, expect, type Page, type Worker } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_ROOT = path.resolve(__dirname, '..');
export const EXTENSION_DIST = path.join(EXTENSION_ROOT, 'dist');

/** `env` reaches the vite build, e.g. VITE_PLAYER_ORIGIN. */
export function buildExtension(env: NodeJS.ProcessEnv = {}): void {
  execFileSync('pnpm', ['--filter', '@cuewise/browser-extension', 'build'], {
    cwd: EXTENSION_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

export interface ExtensionSession {
  context: BrowserContext;
  worker: Worker;
  /** Derived by Chrome from the extension's path, so stable across launches of the same dir. */
  extensionId: string;
}

/**
 * An empty `profileDir` is a fresh temp profile. Headed, as MV3 service workers never register
 * under `--headless=new` here.
 */
export async function launchExtension(
  options: { extensionDir?: string; profileDir?: string } = {}
): Promise<ExtensionSession> {
  const extensionDir = options.extensionDir ?? EXTENSION_DIST;
  const context = await chromium.launchPersistentContext(options.profileDir ?? '', {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return { context, worker, extensionId: new URL(worker.url()).host };
}

/** The new-tab page. A profile shows the welcome dialog once, so only its first visit has a Skip. */
export async function openNewTab(
  session: ExtensionSession,
  { firstVisit = true }: { firstVisit?: boolean } = {}
): Promise<Page> {
  const page = session.context.pages()[0] ?? (await session.context.newPage());
  await page.goto(`chrome-extension://${session.extensionId}/index.html`);
  if (firstVisit) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  return page;
}

/** A copy of dist to mutate — its manifest version can be bumped to stage an update. */
export function copyDist(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'cuewise-ext-'));
  cpSync(EXTENSION_DIST, dir, { recursive: true });
  return dir;
}

export function tempProfileDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'cuewise-profile-'));
}

export function bumpManifestVersion(extensionDir: string): string {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const [major, minor, patch] = String(manifest.version).split('.').map(Number);
  manifest.version = `${major}.${minor}.${patch + 1}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest.version;
}

export async function readActivity(worker: Worker): Promise<ReminderActivityEntry[]> {
  return worker.evaluate(
    async () =>
      ((await chrome.storage.local.get('reminderActivity')).reminderActivity ??
        []) as ReminderActivityEntry[]
  );
}

// The form parses `${date}T${time}` as local time, and the time input accepts seconds.
function localDateAndTime(when: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
  return { date, time };
}

/** Adds a one-off reminder through the bell panel, due `seconds` from now. */
export async function addReminderFromPage(
  page: Page,
  text: string,
  seconds: number
): Promise<void> {
  await page.getByRole('button', { name: /reminders\. Click to expand/ }).click();
  await page.getByRole('button', { name: 'Add reminder' }).click();
  await page.getByRole('button', { name: 'Custom' }).click();
  const { date, time } = localDateAndTime(new Date(Date.now() + seconds * 1000));
  await page.locator('#reminder-text').fill(text);
  await page.locator('#reminder-date').fill(date);
  await page.locator('#reminder-time').fill(time);
  await page.getByRole('dialog').getByRole('button', { name: 'Add reminder' }).click();
}

export async function findReminderId(worker: Worker, text: string): Promise<string> {
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

export async function waitForEvent(
  worker: Worker,
  reminderId: string,
  event: ReminderActivityEntry['event'],
  timeout: number
): Promise<ReminderActivityEntry> {
  let found: ReminderActivityEntry | undefined;
  await expect(async () => {
    const log = await readActivity(worker);
    found = log.find((e) => e.reminderId === reminderId && e.event === event);
    expect(found).toBeDefined();
  }).toPass({ timeout });
  return found as ReminderActivityEntry;
}
