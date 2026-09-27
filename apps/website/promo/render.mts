#!/usr/bin/env -S node
/**
 * Renders promo/composition.html to an MP4, frame by frame, with a generated ambient soundtrack.
 *
 * Usage (from apps/website):
 *   pnpm promo                          # full video → promo/out/cuewise-promo.mp4
 *   pnpm promo --still 12               # one PNG at t=12s → promo/out/still-12.png
 *   pnpm promo --from 20 --to 30        # render a slice (preview a scene)
 *   pnpm promo --fps 60
 *
 * Needs an ffmpeg with libx264 on PATH (or FFMPEG=/path/to/ffmpeg). CHROMIUM_PATH overrides the
 * Playwright browser. Open composition.html directly in a browser to watch a live, looping preview.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { renderMusic } from './music.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');

const { values } = parseArgs({
  options: {
    fps: { type: 'string', default: '30' },
    from: { type: 'string' },
    to: { type: 'string' },
    still: { type: 'string' },
    out: { type: 'string', default: path.join(outDir, 'cuewise-promo.mp4') },
  },
});

const fps = Number(values.fps);
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(path.join(here, 'composition.html')).href);
  const { fontsOk } = await page.evaluate(() => window.promo.ready);
  if (!fontsOk) {
    throw new Error('Poppins/Inter did not load — run pnpm install to fetch @fontsource');
  }
  const duration = await page.evaluate(() => window.promo.duration);
  const cues = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.scene')].map((s) => Number(s.dataset.start))
  );

  if (values.still !== undefined) {
    const t = Number(values.still);
    await page.evaluate((time) => window.promo.seek(time), t);
    const file = path.join(outDir, `still-${t}.png`);
    await page.screenshot({ path: file });
    console.log(`Wrote ${file}`);
  } else {
    const from = Number(values.from ?? 0);
    const to = Math.min(duration, Number(values.to ?? duration));
    const frames = Math.round((to - from) * fps);

    const wav = path.join(outDir, 'music.wav');
    renderMusic(wav, duration, cues);

    const encoder = spawn(
      ffmpeg,
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        String(fps),
        '-c:v',
        'mjpeg',
        '-i',
        '-',
        '-ss',
        String(from),
        '-i',
        wav,
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-shortest',
        '-movflags',
        '+faststart',
        values.out,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] }
    );
    const encoded = new Promise<void>((resolve, reject) => {
      encoder.on('error', reject);
      encoder.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    });

    const started = Date.now();
    for (let f = 0; f < frames; f++) {
      await page.evaluate((time) => window.promo.seek(time), from + f / fps);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!encoder.stdin.write(jpeg)) {
        await new Promise((resolve) => encoder.stdin.once('drain', resolve));
      }
      if (f % fps === 0) {
        const eta = ((Date.now() - started) / (f + 1)) * (frames - f);
        process.stdout.write(`\rframe ${f}/${frames} · ~${Math.round(eta / 1000)}s left   `);
      }
    }
    encoder.stdin.end();
    await encoded;
    console.log(`\nWrote ${values.out}`);
  }
} finally {
  await browser.close();
}

declare global {
  interface Window {
    promo: {
      seek: (t: number) => void;
      duration: number;
      ready: Promise<{ fontsOk: boolean }>;
      scenes: string[];
    };
  }
}
