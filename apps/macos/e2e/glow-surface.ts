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

  // Each pref must visibly change the vignette — a broken pref read would ship
  // a Settings control that silently does nothing.
  const readVignette = () =>
    page.locator('.glow-vignette').evaluate((el) => {
      const style = getComputedStyle(el);
      return { boxShadow: style.boxShadow, background: style.backgroundColor };
    });
  const applyPref = async (key: string, value: string) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
    await page.reload();
    await expect(page.locator('.glow-vignette')).toBeVisible();
  };
  const standard = await readVignette();

  await applyPref('cuewise.posture.glowIntensity', 'subtle');
  expect((await readVignette()).boxShadow).not.toBe(standard.boxShadow);
  await page.evaluate(() => localStorage.removeItem('cuewise.posture.glowIntensity'));

  await applyPref('cuewise.posture.glowStyle', 'border');
  expect((await readVignette()).boxShadow).not.toBe(standard.boxShadow);

  // Tint swaps the edge shadow for an even background wash.
  await applyPref('cuewise.posture.glowStyle', 'tint');
  const tint = await readVignette();
  expect(tint.boxShadow).toBe('none');
  expect(tint.background).not.toBe(standard.background);
  await page.evaluate(() => localStorage.removeItem('cuewise.posture.glowStyle'));
}
