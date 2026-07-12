import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';
import { startSite } from '../../website/e2e/static-server';

// ENG-48: does Chrome actually honor `chrome-extension://<id>` in the player's
// `frame-ancestors`? Drives the REAL built extension (Playwright loads unpacked
// extensions only in Chromium) against the REAL player build+headers, using
// whatever runtime id Chrome assigns this unpacked load — proving the answer
// independently of which id a given local build happens to get, not just that
// the CSP string looks right. Negative control included on purpose: without it
// a green positive proves nothing (same principle as the website's own
// player-frame-ancestors.spec.ts from fea79a9, whose static-server plumbing —
// startSite, now parameterized by frame-ancestors — this spec reuses).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const WEBSITE_ROOT = path.resolve(__dirname, '../../website');
const EXTENSION_DIST = path.join(EXTENSION_ROOT, 'dist');
const WEBSITE_DIST = path.join(WEBSITE_ROOT, 'dist');
const PLAYER_PORT = 8791;
const PLAYER_ORIGIN = `http://localhost:${PLAYER_PORT}`;
const PLAYER_URL_PATTERN = new RegExp(`localhost:${PLAYER_PORT}/player`);

let extensionId: string;
let playerServer: Server;

// Chrome derives an unpacked extension's id deterministically from its dist
// path (confirmed: stable across repeated launches below), so a throwaway
// launch+close here to learn the id, then a fresh context per test, keeps each
// test's Chrome profile (and any persisted sounds-panel state) independent.
async function launchExtensionContext(): Promise<BrowserContext> {
  // MV3 service workers don't register under Chromium's headless mode in this
  // environment (confirmed: 15s timeout waiting for the `serviceworker` event
  // with `--headless=new`; headed registers immediately) — headed is required
  // for loading extensions here, matching Playwright's documented recipe.
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
  });
}

async function discoverExtensionId(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return new URL(worker.url()).host;
}

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/website', 'build'], {
    cwd: WEBSITE_ROOT,
    stdio: 'inherit',
  });
  // VITE_PLAYER_ORIGIN (ENG-48 override) points the real extension code at our
  // local player instead of https://cuewise.app — see youtube-player.ts.
  execFileSync('pnpm', ['--filter', '@cuewise/browser-extension', 'build'], {
    cwd: EXTENSION_ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_PLAYER_ORIGIN: PLAYER_ORIGIN },
  });

  // Nothing has tried to load the player yet — the allowlist content doesn't matter.
  playerServer = await startSite(WEBSITE_DIST, PLAYER_PORT, "'none'");

  const probe = await launchExtensionContext();
  extensionId = await discoverExtensionId(probe);
  await probe.close();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => playerServer.close(() => resolve()));
});

/** Reconfigures the running player server's frame-ancestors allowlist. */
async function setPlayerFrameAncestors(frameAncestors: string): Promise<void> {
  await new Promise<void>((resolve) => playerServer.close(() => resolve()));
  playerServer = await startSite(WEBSITE_DIST, PLAYER_PORT, frameAncestors);
}

test('allowlisted extension id: the player iframe loads', async () => {
  await setPlayerFrameAncestors(`chrome-extension://${extensionId}`);

  const context = await launchExtensionContext();
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.goto(`chrome-extension://${extensionId}/index.html#pomodoro`);
  await page.getByRole('button', { name: 'Open sounds panel' }).click();
  await page.getByRole('button', { name: 'Lofi Hip Hop' }).click();
  await expect(page.locator('#youtube-player-iframe')).toHaveAttribute(
    'src',
    new RegExp(`^${PLAYER_ORIGIN}/player`)
  );

  // A blocked frame never navigates to the player document — only an allowed
  // origin reaches its real title (mirrors the website's own assertion).
  const frame = page.frame({ url: PLAYER_URL_PATTERN });
  await expect(async () => {
    expect(await frame?.title().catch(() => null)).toBe('Cuewise Player');
  }).toPass({ timeout: 5000 });

  await context.close();
});

test('a NOT-allowlisted extension id: the player iframe is blocked', async () => {
  await setPlayerFrameAncestors("'none'");

  const context = await launchExtensionContext();
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.goto(`chrome-extension://${extensionId}/index.html#pomodoro`);
  await page.getByRole('button', { name: 'Open sounds panel' }).click();
  await page.getByRole('button', { name: 'Lofi Hip Hop' }).click();
  await expect(page.locator('#youtube-player-iframe')).toHaveAttribute(
    'src',
    new RegExp(`^${PLAYER_ORIGIN}/player`)
  );
  // Give a would-be-allowed navigation time to complete before asserting absence.
  await page.waitForTimeout(2000);

  const frame = page.frame({ url: PLAYER_URL_PATTERN });
  const title = await frame?.title().catch(() => null);
  expect(
    title,
    `frame-ancestors should have blocked this id, but the frame loaded with title "${title}"`
  ).not.toBe('Cuewise Player');

  await context.close();
});
