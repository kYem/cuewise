import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type FrameLocator, type Page } from '@playwright/test';
import { DOCK_STEPS, type StepKey } from '../../src/lib/home-content';
import { startSite } from '../static-server';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST_DIR = path.join(ROOT, 'dist');

const WITH_DEMO_PORT = 4537;
const WITHOUT_DEMO_PORT = 4538;
export const WITH_DEMO = `http://localhost:${WITH_DEMO_PORT}`;
export const WITHOUT_DEMO = `http://localhost:${WITHOUT_DEMO_PORT}`;
export const STEPS: readonly StepKey[] = DOCK_STEPS.map((step) => step.key);
export const STEP_TIMEOUT = { timeout: 15_000 };
export const GOES_LIVE = { timeout: 15_000 };

const PROBLEM_PATTERN = /Content Security Policy|Refused to/;
const DEMO_FOLDERS = ['demo', 'assets'];

export const TODAY_SHOT_FILE = path.join(ROOT, 'src', 'assets', 'demo', 'today.webp');

function runWebsiteScript(script: string) {
  execFileSync('pnpm', ['--filter', '@cuewise/website', script], { cwd: ROOT, stdio: 'inherit' });
}

function close(server: Server) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

export interface DemoSites {
  stop(): Promise<void>;
}

export async function startDemoSites(): Promise<DemoSites> {
  runWebsiteScript('demo:fetch');
  runWebsiteScript('build');
  if (!existsSync(path.join(DIST_DIR, 'demo', 'index.html'))) {
    throw new Error('dist/demo/index.html is missing, so nothing here would prove the demo runs');
  }

  const withoutDemoDir = mkdtempSync(path.join(tmpdir(), 'cuewise-site-without-demo-'));
  cpSync(DIST_DIR, withoutDemoDir, {
    recursive: true,
    filter: (source) => !DEMO_FOLDERS.some((folder) => source === path.join(DIST_DIR, folder)),
  });
  const servers = [
    await startSite(DIST_DIR, WITH_DEMO_PORT),
    await startSite(withoutDemoDir, WITHOUT_DEMO_PORT),
  ];

  return {
    async stop() {
      await Promise.all(servers.map(close));
      rmSync(withoutDemoDir, { recursive: true, force: true });
    },
  };
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (PROBLEM_PATTERN.test(message.text())) {
        problems.push(`console: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      problems.push(`page error: ${error.message}`);
    });
    await use(page);
    expect(problems, 'CSP refusals and page errors').toEqual([]);
  },
});

export { expect };

export const stageOf = (page: Page) => page.locator('[data-stage]');
export const liveLayerOf = (page: Page) => page.locator('[data-stage-live]');
export const demoFrameOf = (page: Page): FrameLocator =>
  page.frameLocator('[data-stage-live] iframe');
export const demoIframeOf = (page: Page) => page.locator('[data-stage-live] iframe');
export const dockButtonOf = (page: Page, step: StepKey) =>
  page.locator(`.dock button[data-step="${step}"]`);
export const shotOf = (page: Page, step: StepKey) =>
  page.locator(`.stage-shot[data-step="${step}"]`);

export async function openLiveHomepage(page: Page) {
  await page.goto(`${WITH_DEMO}/`);
  await expect(stageOf(page)).toHaveClass(/is-live/, GOES_LIVE);
  await expect(stageOf(page)).not.toHaveClass(/is-fallback/, STEP_TIMEOUT);
  await expect(liveLayerOf(page)).toHaveCSS('opacity', '1');
}

export function collectDemoWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().startsWith('Cuewise demo:')) {
      warnings.push(message.text());
    }
  });
  return warnings;
}

export async function waitForUpgradeDecision(page: Page) {
  await expect(shotOf(page, 'themes')).toHaveAttribute('src', /.+/);
}

export async function scrollStageIntoView(page: Page) {
  await stageOf(page).evaluate((stage) =>
    stage.scrollIntoView({ block: 'center', behavior: 'instant' })
  );
}

export const PAGE_SETTLE_MS = 600;

export async function readPageState(page: Page) {
  return page.evaluate(() => ({ entries: history.length, scrollY: window.scrollY }));
}

export async function settledPageState(page: Page) {
  await page.waitForTimeout(PAGE_SETTLE_MS);
  return readPageState(page);
}

export async function selectStep(page: Page, step: StepKey) {
  await dockButtonOf(page, step).click();
  await expect(stageOf(page)).toHaveAttribute('data-live-step', step, STEP_TIMEOUT);
  await expect(stageOf(page)).not.toHaveClass(/is-fallback/, STEP_TIMEOUT);
}

export interface StageSample {
  live: number;
  coverage: number;
  theme: string | null;
}

/** Clicks a dock step and reads, every animation frame, how much of each layer is showing. */
export async function watchStep(page: Page, step: StepKey, forMs: number): Promise<StageSample[]> {
  return page.evaluate(
    ({ stepKey, duration }) =>
      new Promise<StageSample[]>((resolve) => {
        const samples: StageSample[] = [];
        const layer = document.querySelector('[data-stage-live]');
        const started = performance.now();
        const sample = () => {
          const frame = layer?.querySelector('iframe');
          const shots = [...document.querySelectorAll('.stage-shot')].map((shot) =>
            Number(getComputedStyle(shot).opacity)
          );
          samples.push({
            live: layer ? Number(getComputedStyle(layer).opacity) : 0,
            coverage: 1 - shots.reduce((gap, opacity) => gap * (1 - opacity), 1),
            theme: frame?.contentDocument?.documentElement?.getAttribute('data-theme') ?? null,
          });
          if (performance.now() - started < duration) {
            requestAnimationFrame(sample);
          } else {
            resolve(samples);
          }
        };
        document.querySelector<HTMLButtonElement>(`.dock button[data-step="${stepKey}"]`)?.click();
        requestAnimationFrame(sample);
      }),
    { stepKey: step, duration: forMs }
  );
}
