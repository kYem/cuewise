import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startAttacker, startSite } from './static-server';

// ENG-48: proves the player's real frame-ancestors header actually blocks a
// stranger, not just that the header string looks right. The "attacker" page is
// served from a different PORT than the player — different port means different
// origin, so it is genuinely outside frame-ancestors' allowlist.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PLAYER_PORT = 4527;
const ATTACKER_PORT = 4528;
const VIDEO_ID = 'jfKfPfyJRdk';

let playerServer: Server;
let attackerServer: Server;

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/website', 'build'], { cwd: ROOT, stdio: 'inherit' });
  playerServer = await startSite(DIST_DIR, PLAYER_PORT);
  attackerServer = await startAttacker(
    `<!doctype html><iframe id="target" src="http://localhost:${PLAYER_PORT}/player.html?v=${VIDEO_ID}"></iframe>`,
    ATTACKER_PORT
  );
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => playerServer.close(() => resolve()));
  await new Promise<void>((resolve) => attackerServer.close(() => resolve()));
});

test('a disallowed origin cannot frame the player', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Content Security Policy|frame-ancestors/i.test(message.text())
    ) {
      violations.push(message.text());
    }
  });

  await page.goto(`http://localhost:${ATTACKER_PORT}/`);
  await page.waitForTimeout(2000);

  const frame = page.frame({ url: new RegExp(`localhost:${PLAYER_PORT}/player\\.html`) });
  // A blocked frame never navigates to the player document at all — WebKit
  // reports it (if reachable via Frame API) as never loaded / no title, unlike an
  // allowed origin which would show "Cuewise Player".
  const title = await frame?.title().catch(() => null);

  expect(
    title,
    `frame-ancestors should have blocked this navigation, but the frame loaded with title "${title}". CSP console messages: ${violations.join(' | ')}`
  ).not.toBe('Cuewise Player');
});

test('sanity check: the player itself loads with title "Cuewise Player" when not framed', async ({
  page,
}) => {
  // Proves the title-based assertion in the test above actually means something —
  // if this ever stopped being the real title, that test would pass for the wrong reason.
  await page.goto(`http://localhost:${PLAYER_PORT}/player.html?v=${VIDEO_ID}`);
  await expect(page).toHaveTitle('Cuewise Player');
});
