import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startSite } from './static-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = 4531;

const API = '**/api/feedback/request';

let server: Server;

test.beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@cuewise/website', 'build'], { cwd: ROOT, stdio: 'inherit' });
  // Real middleware headers, so a CSP that blocked the form's script would fail these.
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

  // Asserted across the reason/contact seam: Astro drops a whitespace-only node between tags,
  // and either half alone still passes when the two are jammed together.
  await expect(page.locator('#form-error')).toContainText(
    'Could not send your request just now. You can always email us at support@cuewise.app'
  );
  await expect(page.locator('#form-error a[href^="mailto:"]')).toBeVisible();
});

test('holds the button down over a timeout, then gives it back', async ({ page }) => {
  // Both waits are the page's own setTimeout, so a fake clock covers a 35s behaviour in ~1s.
  await page.clock.install();
  await page.route(API, () => {
    // Deliberately never fulfilled: this is what a hung request looks like.
  });

  await fillAndSubmit(page);

  // The send may still land, so the button is held rather than freed — but never for good.
  await page.clock.fastForward(16_000);
  await expect(page.locator('#form-error')).toContainText('Still sending');
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();

  await page.clock.fastForward(21_000);
  await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
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
