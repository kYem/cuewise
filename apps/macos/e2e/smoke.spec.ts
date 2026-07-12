import { expect, test } from '@playwright/test';
import { stubThirdPartyRequests, watchForRealNetworkEscapes } from './network-stub';

// Console noise that is not an app fault.
const IGNORED = [/favicon/i];

// Every hash-routed surface, ending back on home.
const ROUTES = ['#pomodoro', '#insights', '#goals', '#quotes', '#concepts', ''];

// Error-boundary copy — its presence means a surface threw during render.
const ERROR_BOUNDARY = /We encountered an unexpected error/i;

test('reused extension UI renders on every surface without errors (WebKit)', async ({ page }) => {
  const errors: string[] = [];
  // Default colorTheme is 'glass', which fetches an Unsplash background on mount —
  // stub it so this spec doesn't depend on the live internet either.
  await stubThirdPartyRequests(page);
  const getEscapedRequests = watchForRealNetworkEscapes(page);
  page.on('console', (message) => {
    if (message.type() === 'error' && !IGNORED.some((pattern) => pattern.test(message.text()))) {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  // Home + onboarding: the welcome modal shows on a clean store; its logo (an
  // app-root asset) must actually resolve, not fall back to a broken image.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Cuewise!' })).toBeVisible();
  const logoLoaded = await page
    .locator('img[alt="Cuewise logo"]')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(logoLoaded, 'welcome-modal logo should load').toBe(true);
  await page.getByRole('button', { name: 'Get Started' }).click();

  // Sweep every page.
  for (const route of ROUTES) {
    await page.goto(`/${route}`);
    await page.waitForTimeout(300);
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  }

  // The Settings modal — the surface that regressed on a missing vite define.
  await page.getByRole('button', { name: 'Menu' }).last().click();
  await page.getByRole('menuitem', { name: 'Settings' }).last().click();
  await page.waitForTimeout(300);
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);

  expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
  expect(getEscapedRequests(), 'off-origin requests must never reach the real network').toEqual([]);
});
