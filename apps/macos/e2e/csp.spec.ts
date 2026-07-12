import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { buildCspHeader, startCspServer } from './csp-static-server';

// Verifies the PRODUCTION CSP (tauri.conf.json `app.security.csp`) against the
// real `vite build` output, served with the policy as a genuine
// `Content-Security-Policy` header — not a meta tag — over a self-hosted static
// server (not the shared `pnpm dev:vite` webServer in playwright.config.ts,
// which serves unbuilt dev code and never gets this header at all; see the dev
// note at the bottom). WebKit approximates the Tauri WKWebView on macOS. Rebuilds
// fresh in beforeAll so this always checks what actually ships, and reads the
// policy from tauri.conf.json directly (not a copy) so editing the config alone
// is enough to prove the test can fail.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const CONFIG_PATH = path.join(ROOT, 'src-tauri/tauri.conf.json');
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// connect-src only lists origins with a real fetch/XHR today. ENG-43 must add
// https://api.cuewise.app here specifically (not a wildcard) for the sync client.

// A playlist id that is NOT one of DEFAULT_YOUTUBE_PLAYLISTS, so addCustomPlaylist()
// actually calls fetchPlaylistMetadata() (the oEmbed + fallback-page connect-src
// paths) instead of short-circuiting with the "already added" toast.
const CUSTOM_PLAYLIST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLcsp0e2eprobe000';

interface Violation {
  violatedDirective: string;
  blockedURI: string;
}

let server: Server;

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/macos', 'build:vite'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const csp = buildCspHeader(config.app.security.csp);
  server = await startCspServer(DIST_DIR, csp, PORT);
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('production build reports zero CSP violations across every surface (WebKit)', async ({
  page,
}) => {
  const violations: Violation[] = [];
  await page.exposeFunction('__onCspViolation', (violation: Violation) => {
    violations.push(violation);
  });
  // Runs before any page script on every subsequent navigation, so it catches
  // violations from the very first paint onward.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      // @ts-expect-error injected by page.exposeFunction above
      window.__onCspViolation({
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
      });
    });
  });

  await page.goto(BASE_URL);
  await expect(page.getByRole('heading', { name: 'Welcome to Cuewise!' })).toBeVisible();
  await page.getByRole('button', { name: 'Get Started' }).click();

  await test.step('sweep every hash-routed surface', async () => {
    // Home ('') last, matching smoke.spec.ts — the "Menu" button that opens
    // Settings next only exists on NewTabPage.
    for (const route of ['#pomodoro', '#insights', '#goals', '#quotes', '#concepts', '']) {
      await page.goto(`${BASE_URL}/${route}`);
      await page.waitForTimeout(300);
    }
  });

  await test.step('quick links: adding a link requests a favicon (img-src)', async () => {
    // showQuickLinks defaults to true, so this exercises a default-on surface.
    // google's favicon endpoint 302s to a *.gstatic.com host, and CSP checks the
    // redirect target too — img-src needs both origins, not just google.com.
    await page.getByRole('button', { name: 'Add a quick link' }).click();
    // Scoped to the dropdown menu — GoalInput on the same page has its own
    // disabled "Add" button that would otherwise make this locator ambiguous.
    const menu = page.getByRole('menu');
    await menu.getByRole('button', { name: 'Add link' }).click();
    await page.getByPlaceholder('example.com').fill('https://github.com');
    await menu.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByPlaceholder('example.com')).toHaveCount(0);
  });

  await test.step('open Settings', async () => {
    await page.getByRole('button', { name: 'Menu' }).last().click();
    await page.getByRole('menuitem', { name: 'Settings' }).last().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  });

  await test.step('sounds panel: a seeded playlist creates the YouTube iframe', async () => {
    await page.goto(`${BASE_URL}/#pomodoro`);
    await page.getByRole('button', { name: 'Open sounds panel' }).click();
    await page.getByRole('button', { name: 'Lofi Hip Hop' }).click();
    await expect(page.locator('#youtube-player-iframe')).toHaveAttribute(
      'src',
      /cuewise\.app\/player/
    );
  });

  await test.step('sounds panel: adding a custom playlist hits the oEmbed connect-src path', async () => {
    // Selecting a playlist above switched the panel to the "Playing" tab
    // (playYoutube() sets activeTab: 'nowPlaying'); "Add Custom Playlist" only
    // exists on the "YouTube" tab.
    await page.getByRole('button', { name: 'YouTube' }).click();
    await page.getByRole('button', { name: 'Add Custom Playlist' }).click();
    await page.getByPlaceholder('YouTube playlist URL').fill(CUSTOM_PLAYLIST_URL);
    await page.getByRole('button', { name: 'Add Playlist' }).click();
    // handleAddPlaylist() only clears/closes the form after addCustomPlaylist()
    // resolves, so this confirms the fetch attempt (success or graceful failure)
    // ran, without depending on the target playlist's real metadata.
    await expect(page.getByPlaceholder('YouTube playlist URL')).toHaveCount(0);
  });

  await test.step('focus mode requests an Unsplash background', async () => {
    await page.keyboard.press('Escape'); // close the sounds popover
    await page.getByRole('button', { name: 'Enter focus mode' }).click();
    // Best-effort: BackgroundImage only mounts role="img" once its own preflight
    // `new Image()` actually loads — the CSP check itself already ran the moment
    // that `.src` was assigned, regardless of whether the load succeeds in time.
    await page
      .getByRole('img', { name: 'Focus mode background' })
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    await page.keyboard.press('Escape'); // exit focus mode
  });

  const details = violations
    .map((v) => `  - ${v.violatedDirective}: blocked ${v.blockedURI}`)
    .join('\n');
  expect(violations, `CSP violations:\n${details}`).toEqual([]);
});

// Note on `app.security.devCsp`: for this project's devUrl-based `tauri dev`
// workflow, Tauri never actually delivers it — the webview navigates straight to
// the raw Vite dev server response (confirmed empirically: `curl -I` against
// `pnpm dev:vite` shows no Content-Security-Policy header), because desktop's
// `PROXY_DEV_SERVER` constant is `cfg!(all(dev, mobile))`, false here, so the
// tauri:// asset-protocol code path that injects the header is never reached.
// devCsp is still configured for contract-correctness (and in case that ever
// changes upstream), but there is no dev-mode equivalent of this spec to write —
// there is no real header to assert on. The Playwright config's existing
// `pnpm dev:vite` webServer (smoke.spec.ts) is the coverage that exists for dev.
