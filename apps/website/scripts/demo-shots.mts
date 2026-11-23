#!/usr/bin/env -S node
/**
 * Screenshots the pinned demo (public/demo) into src/assets/demo/<step>.webp, one per demo step.
 * Fetches the pinned release first, so it needs network access for that and its background photo.
 *
 * Usage (from apps/website):
 *   pnpm demo:shots
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { startPlainSite } from '../e2e/static-server.ts';
import { DEMO_STEPS } from '../public/scripts/demo-remote.js';
import { buildDemoSeed } from '../public/scripts/demo-seed.js';
import { fetchPinnedDemo } from './lib/demo-install.mts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'src', 'assets', 'demo');
const PORT = 4610;
const DEMO_URL = `http://localhost:${PORT}/demo/index.html`;
const SETTLE_MS = 1200;

async function main() {
  const { version, files } = await fetchPinnedDemo(root);
  console.log(`demo ${version}: ${files} files`);
  mkdirSync(outDir, { recursive: true });

  const server = await startPlainSite(publicDir, PORT);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.addInitScript((seed) => {
      if (localStorage.getItem('goals') !== null) {
        return;
      }
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, buildDemoSeed(new Date()));

    const ready = async () => {
      await page.getByText("Today's Focus").first().waitFor();
    };
    await page.goto(DEMO_URL);
    await ready();

    for (const step of DEMO_STEPS) {
      if (step === 'themes') {
        await page.evaluate(() =>
          localStorage.setItem('settings.colorTheme', JSON.stringify('purple'))
        );
        await page.goto(DEMO_URL);
        await ready();
      } else {
        const done = await page.evaluate(async (name) => {
          const { createDemoRemote } = await import('/scripts/demo-remote.js');
          return createDemoRemote(window, localStorage).go(name);
        }, step);
        if (!done) {
          throw new Error(`Demo step "${step}" failed.`);
        }
      }
      await page.waitForTimeout(SETTLE_MS);

      const webp = await sharp(await page.screenshot({ type: 'png' }))
        .webp({ quality: 80 })
        .toBuffer();
      writeFileSync(path.join(outDir, `${step}.webp`), webp);
      console.log(`${step}.webp ${(webp.length / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
