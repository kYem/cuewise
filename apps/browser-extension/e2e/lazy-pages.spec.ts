import { rmSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { buildExtension, launchExtension, openNewTab, tempProfileDir } from './extension-harness';

// ENG-156: every page but home is its own chunk, so this proves each one loads under the
// extension's CSP from the built dist, which the vite dev server never exercises.
const PAGES: { hash: string; ready: (page: Page) => ReturnType<Page['getByRole']> }[] = [
  { hash: 'insights', ready: (page) => page.getByRole('heading', { name: 'Your Insights' }) },
  { hash: 'goals', ready: (page) => page.getByRole('heading', { name: 'Goals & Tasks' }) },
  { hash: 'quotes', ready: (page) => page.getByRole('heading', { name: 'Quote Management' }) },
  { hash: 'concepts', ready: (page) => page.getByRole('heading', { name: 'Concepts' }) },
  { hash: 'pomodoro', ready: (page) => page.getByTestId('pomodoro-timer-card') },
];

let profileDir: string;

test.beforeAll(() => {
  buildExtension();
  profileDir = tempProfileDir();
});

test.afterAll(() => {
  rmSync(profileDir, { recursive: true, force: true });
});

test('each page loads its own chunk from the built extension', async () => {
  test.setTimeout(60_000);
  const session = await launchExtension({ profileDir });
  const page = await openNewTab(session);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const { hash, ready } of PAGES) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(ready(page), `#${hash} never rendered`).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
  await session.context.close();
});
