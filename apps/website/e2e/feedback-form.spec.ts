import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startSite } from './static-server';

// The form's script is the one file here no unit test can reach — it is served as a static asset
// so CSP script-src stays 'self'. startSite applies the real middleware headers, so this also
// proves the script loads under the shipped CSP rather than being silently blocked.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = 4531;

const API = '**/api/feedback/request';

let server: Server;

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/website', 'build'], { cwd: ROOT, stdio: 'inherit' });
  server = await startSite(DIST_DIR, PORT);
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function fillAndSubmit(page: import('@playwright/test').Page) {
  await page.goto(`http://localhost:${PORT}/feedback/`);
  await page.getByRole('radio', { name: 'Goals & tasks' }).check();
  await page.getByLabel('What would you like it to do?').fill('Recurring daily tasks.');
  await page.getByRole('button', { name: 'Send request' }).click();
}

test('shows the reason a request was refused, and lets the user fix it', async ({ page }) => {
  await page.route(API, (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'that came through empty' }),
    })
  );

  await fillAndSubmit(page);

  await expect(page.locator('#form-error')).toContainText('that came through empty');
  await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
  // A fixable mistake must not also be told the send failed and to email support instead.
  await expect(page.locator('#form-error')).not.toContainText("Couldn't send");
});

test('keeps the support address reachable on every failure', async ({ page }) => {
  await page.route(API, (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not send your request just now.' }),
    })
  );

  await fillAndSubmit(page);

  // Both halves: the anchor alone is static markup and would pass even if the message vanished.
  await expect(page.locator('#form-error')).toContainText('Could not send your request');
  await expect(page.locator('#form-error a[href^="mailto:"]')).toBeVisible();
  // The address must not be jammed against the word before it — Astro drops a newline there.
  await expect(page.locator('#form-error')).toContainText('email us at support@cuewise.app');
});

test('confirms a sent request in place', async ({ page }) => {
  await page.route(API, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
  );

  await fillAndSubmit(page);

  await expect(page.locator('#thanks')).toBeVisible();
  await expect(page.locator('#request-form')).toBeHidden();
});

test('serves the pages the handler redirects a scriptless submit to', async ({ page }) => {
  for (const outcome of ['sent', 'failed']) {
    const response = await page.goto(`http://localhost:${PORT}/feedback/${outcome}/`);
    expect(response?.status(), `/feedback/${outcome}/ must exist`).toBe(200);
  }
  await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
});
