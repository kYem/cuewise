import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Default-import + destructure: Playwright's loader compiles the workspace
// package to CJS, so named ESM imports from it fail at runtime.
import shared from '@cuewise/shared';
import { expect, test } from '@playwright/test';
import { startSite } from '../../website/e2e/static-server';
import { buildExtension, launchExtension } from './extension-harness';

const { DEFAULT_YOUTUBE_PLAYLISTS } = shared;

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
const WEBSITE_ROOT = path.resolve(__dirname, '../../website');
const WEBSITE_DIST = path.join(WEBSITE_ROOT, 'dist');
const PLAYER_PORT = 8791;
const PLAYER_ORIGIN = `http://localhost:${PLAYER_PORT}`;
const PLAYER_URL_PATTERN = new RegExp(`localhost:${PLAYER_PORT}/player`);

let extensionId: string;
let playerServer: Server;

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/website', 'build'], {
    cwd: WEBSITE_ROOT,
    stdio: 'inherit',
  });
  // VITE_PLAYER_ORIGIN (ENG-48 override) points the real extension code at our
  // local player instead of https://cuewise.app — see youtube-player.ts.
  buildExtension({ VITE_PLAYER_ORIGIN: PLAYER_ORIGIN });

  // Nothing has tried to load the player yet — the allowlist content doesn't matter.
  playerServer = await startSite(WEBSITE_DIST, PLAYER_PORT, "'none'");

  // A throwaway launch learns the id once; each test then gets a fresh profile, so persisted
  // sounds-panel state cannot leak between them.
  const probe = await launchExtension();
  extensionId = probe.extensionId;
  await probe.context.close();
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

  const { context } = await launchExtension();
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.goto(`chrome-extension://${extensionId}/index.html#pomodoro`);
  await page.getByRole('button', { name: 'Open sounds panel' }).click();
  await page.getByRole('button', { name: DEFAULT_YOUTUBE_PLAYLISTS[0].name }).click();
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

  const { context } = await launchExtension();
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.goto(`chrome-extension://${extensionId}/index.html#pomodoro`);
  await page.getByRole('button', { name: 'Open sounds panel' }).click();
  await page.getByRole('button', { name: DEFAULT_YOUTUBE_PLAYLISTS[0].name }).click();
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
