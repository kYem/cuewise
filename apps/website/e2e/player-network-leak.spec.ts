import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startPlainSite } from './static-server';

// ENG-48: proves the youtube-nocookie switch itself stops the ad/tracking leak,
// against the REAL network (not a stub) — the whole point is to see what the embed
// really contacts. No CSP header here on purpose: frame-src would also block a
// youtube.com iframe and mask whether the nocookie switch is what's doing the work
// (CSP's frame-ancestors/frame-src enforcement has its own spec). Builds fresh in
// beforeAll so this checks what actually ships.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = 4517;
const BASE_URL = `http://localhost:${PORT}`;
const VIDEO_ID = 'jfKfPfyJRdk';

const AD_TRACKING_HOST_PATTERNS = [/doubleclick/i, /googleads/i, /googlesyndication/i];

let server: Server;

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/website', 'build'], { cwd: ROOT, stdio: 'inherit' });
  server = await startPlainSite(DIST_DIR, PORT);
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('the player never contacts a doubleclick/googleads/googlesyndication host', async ({
  page,
}) => {
  const contactedHosts = new Set<string>();
  const responses: Array<{ host: string; status: number }> = [];
  page.on('request', (request) => {
    contactedHosts.add(new URL(request.url()).hostname);
  });
  page.on('response', (response) => {
    responses.push({ host: new URL(response.url()).hostname, status: response.status() });
  });

  await page.goto(`${BASE_URL}/player.html?v=${VIDEO_ID}`);

  const iframe = page.locator('#wrap iframe');
  await expect(iframe).toHaveAttribute(
    'src',
    new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VIDEO_ID}`)
  );

  // Let the embed finish its network chatter — ad beacons (if present) fire after load.
  await page.waitForTimeout(5000);

  const adHosts = [...contactedHosts].filter((host) =>
    AD_TRACKING_HOST_PATTERNS.some((pattern) => pattern.test(host))
  );
  expect(adHosts, `ad/tracking hosts contacted:\n${adHosts.join('\n')}`).toEqual([]);

  const nocookieResponse = responses.find((r) => r.host === 'www.youtube-nocookie.com');
  expect(
    nocookieResponse?.status,
    `the youtube-nocookie iframe must load. Hosts contacted:\n${[...contactedHosts].join('\n')}`
  ).toBeLessThan(400);
});
