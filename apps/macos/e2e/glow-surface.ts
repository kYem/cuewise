import { expect, type Page } from '@playwright/test';

// #glow is a document-entry branch, not a client-side route: a hash-only goto is
// same-document, so force a real load. Call last — the app document is gone after.
export async function assertGlowSurfaceRenders(page: Page, baseUrl = ''): Promise<void> {
  await page.goto(`${baseUrl}/#glow`);
  await page.reload();
  await expect(page.locator('.glow-vignette')).toBeVisible();
}
