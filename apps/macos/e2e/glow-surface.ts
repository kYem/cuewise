import { expect, type Page } from '@playwright/test';

// #glow is a document-entry branch, not a client-side route: a hash-only goto is
// same-document, so force a real load. Call last — the app document is gone after.
export async function assertGlowSurfaceRenders(page: Page, baseUrl = ''): Promise<void> {
  await page.goto(`${baseUrl}/#glow`);
  await page.reload();
  await expect(page.locator('.glow-vignette')).toBeVisible();

  // The overlay must be genuinely see-through — a future theme rule painting an
  // opaque body would turn every nudge into a full-screen sheet, invisibly to CI.
  const backgrounds = await page.evaluate(() => [
    getComputedStyle(document.documentElement).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ]);
  for (const background of backgrounds) {
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(background);
  }

  // And it must NOT boot the app shell (double reminder delivery per monitor):
  // the root must hold nothing but the vignette, regardless of onboarding state.
  await expect(page.locator('#root > :not(.glow-vignette)')).toHaveCount(0);
}
