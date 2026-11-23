import type { StepKey } from '../src/lib/home-content';
import {
  type DemoSites,
  demoFrameOf,
  demoIframeOf,
  dockButtonOf,
  expect,
  GOES_LIVE,
  liveLayerOf,
  openLiveHomepage,
  STEP_TIMEOUT,
  STEPS,
  scrollStageIntoView,
  selectStep,
  shotOf,
  stageOf,
  startDemoSites,
  test,
  WITH_DEMO,
  WITHOUT_DEMO,
  waitForUpgradeDecision,
} from './__fixtures__/home-demo.fixtures';

const ALLOWED_HOSTS = new Set([
  'localhost',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'images.unsplash.com',
]);
const TOUR_DWELL_MS = 5200;
const STEERING_GIVES_UP_MS = 10_000;
const MISSING_DEMO_WAIT_MS = 8000;

let sites: DemoSites | undefined;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  sites = await startDemoSites();
});

test.afterAll(async () => {
  await sites?.stop();
});

test('runs the released extension in the frame', async ({ page }) => {
  await page.goto(`${WITH_DEMO}/next/`);
  await expect(stageOf(page)).toHaveClass(/is-live/, GOES_LIVE);
  await expect(demoFrameOf(page).getByText("Today's Focus")).toBeVisible();
  await expect(demoFrameOf(page).getByText('1/3')).toBeVisible();
  await expect(page.locator('[data-stage-note]')).toHaveText(/This is the extension itself/);
  await expect(page.locator('[data-stage-cta]')).toHaveText('Try it right here');
  await expect(liveLayerOf(page)).toHaveJSProperty('inert', false);
});

test('the dock steers the running app', async ({ page }) => {
  test.setTimeout(120_000);
  const frame = demoFrameOf(page);
  const arrivals: [StepKey, () => Promise<void>][] = [
    [
      'pomodoro',
      async () => {
        await expect(frame.getByText('Focus Session').first()).toBeVisible(STEP_TIMEOUT);
        await expect(frame.getByText('24:16').first()).toBeVisible(STEP_TIMEOUT);
      },
    ],
    [
      'focus',
      async () => {
        await expect(frame.locator('[role=dialog][aria-label="Focus mode"]')).toBeVisible(
          STEP_TIMEOUT
        );
      },
    ],
    [
      'recall',
      async () => {
        await expect(frame.getByText('Confirmation bias').first()).toBeVisible(STEP_TIMEOUT);
        await expect(frame.getByText('Bring it to mind, then reveal').first()).toBeVisible(
          STEP_TIMEOUT
        );
      },
    ],
    [
      'insights',
      async () => {
        await expect(frame.getByText('Current Streak').first()).toBeVisible(STEP_TIMEOUT);
      },
    ],
    [
      'themes',
      async () => {
        await expect(frame.locator('html[data-theme="purple"]')).toBeAttached(STEP_TIMEOUT);
      },
    ],
    [
      'today',
      async () => {
        await expect(frame.locator('html[data-theme="glass"]')).toBeAttached(STEP_TIMEOUT);
        await expect(frame.getByText("Today's Focus").first()).toBeVisible(STEP_TIMEOUT);
      },
    ],
  ];

  await openLiveHomepage(page);
  for (const [step, arrive] of arrivals) {
    await dockButtonOf(page, step).click();
    await arrive();
    await expect(stageOf(page)).not.toHaveClass(/is-fallback/, STEP_TIMEOUT);
  }
});

test('the tour steers the running app too', async ({ page }) => {
  await openLiveHomepage(page);
  await scrollStageIntoView(page);

  await expect(dockButtonOf(page, 'pomodoro')).toHaveAttribute('aria-pressed', 'true', {
    timeout: TOUR_DWELL_MS * 2,
  });
  await expect(demoFrameOf(page).getByText('Focus Session').first()).toBeVisible(STEP_TIMEOUT);
  await expect(stageOf(page)).not.toHaveClass(/is-fallback/, STEP_TIMEOUT);
});

test('clicking into the frame stops the tour', async ({ page }) => {
  const caption = page.locator('[data-stage-caption]');
  await openLiveHomepage(page);
  await scrollStageIntoView(page);
  await expect(caption).toHaveAttribute('aria-live', 'off');

  await demoFrameOf(page)
    .locator('body')
    .click({ position: { x: 20, y: 400 } });
  await page.waitForTimeout(TOUR_DWELL_MS + 2000);

  await expect(caption).toHaveAttribute('aria-live', 'polite');
  await expect(dockButtonOf(page, 'today')).toHaveAttribute('aria-pressed', 'true');
});

test('contacts only the site, the font hosts and Unsplash', async ({ page }) => {
  test.setTimeout(120_000);
  const hosts = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http')) {
      hosts.add(url.hostname);
    }
  });

  await openLiveHomepage(page);
  for (const step of STEPS) {
    await selectStep(page, step);
  }

  expect([...hosts].filter((host) => !ALLOWED_HOSTS.has(host))).toEqual([]);
  expect(hosts.has('localhost')).toBe(true);
});

test('last click wins', async ({ page }) => {
  await openLiveHomepage(page);

  await dockButtonOf(page, 'pomodoro').click();
  await dockButtonOf(page, 'insights').click();
  await dockButtonOf(page, 'recall').click();

  await expect(demoFrameOf(page).getByText('Confirmation bias').first()).toBeVisible(STEP_TIMEOUT);
  await expect(page.locator('.dock button[aria-pressed="true"]')).toHaveCount(1);
  await expect(dockButtonOf(page, 'recall')).toHaveAttribute('aria-pressed', 'true');
  await expect(stageOf(page)).not.toHaveClass(/is-fallback/, STEP_TIMEOUT);
});

test('falls back to the screenshot when a step fails', async ({ page }) => {
  test.setTimeout(60_000);
  await openLiveHomepage(page);
  await page.evaluate(() => {
    document
      .querySelector<HTMLIFrameElement>('[data-stage-live] iframe')
      ?.contentWindow?.location.replace('about:blank');
  });

  await dockButtonOf(page, 'insights').click();
  await page.waitForTimeout(STEERING_GIVES_UP_MS);

  await expect(stageOf(page)).toHaveClass(/is-fallback/);
  await expect(shotOf(page, 'insights')).toHaveClass(/is-on/);
  await expect(liveLayerOf(page)).toHaveJSProperty('inert', true);
});

test('a narrow window gets screenshots and no frame', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(`${WITH_DEMO}/next/`);
  await waitForUpgradeDecision(page);
  await page.waitForTimeout(4000);
  await expect(demoIframeOf(page)).toHaveCount(0);
  await expect(liveLayerOf(page)).toBeHidden();
  await page.locator('.dock button[data-step="insights"]').click();
  await expect(page.locator('.stage-shot[data-step="insights"]')).toHaveClass(/is-on/);
  await expect(page.locator('[data-stage-note]')).toHaveText('Real screenshots of the extension.');
});

test('under reduced motion the tour never advances', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLiveHomepage(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true
  );
  await scrollStageIntoView(page);

  await page.waitForTimeout(TOUR_DWELL_MS + 2000);

  await expect(dockButtonOf(page, 'today')).toHaveAttribute('aria-pressed', 'true');
  await expect(demoFrameOf(page).getByText("Today's Focus").first()).toBeVisible();
});

test('stays on screenshots when the demo is missing', async ({ page }) => {
  const demoRequested = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/demo/',
    {
      timeout: 15_000,
    }
  );
  await page.goto(`${WITHOUT_DEMO}/next/`);
  await demoRequested;
  await expect(demoIframeOf(page)).toHaveCount(0);
  await page.waitForTimeout(MISSING_DEMO_WAIT_MS);
  await expect(stageOf(page)).not.toHaveClass(/is-live/);
  await expect(demoIframeOf(page)).toHaveCount(0);
  await expect(liveLayerOf(page)).toBeHidden();
  await expect(page.locator('[data-stage-note]')).toHaveText('Real screenshots of the extension.');
});

test('stays on screenshots when the app never renders', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/\/assets\/newtab-[^/]*\.js$/, (route) => route.abort());
  const demoRequested = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/demo/'
  );
  await page.goto(`${WITH_DEMO}/next/`);
  await demoRequested;
  await expect(demoIframeOf(page)).toHaveCount(1);

  await expect(demoIframeOf(page)).toHaveCount(0, { timeout: 20_000 });
  await expect(stageOf(page)).not.toHaveClass(/is-live/);
  await expect(liveLayerOf(page)).toBeHidden();
});

test('stays on screenshots when storage is blocked', async ({ page }) => {
  const demoRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/demo/') {
      demoRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });

  await page.goto(`${WITH_DEMO}/next/`);
  await waitForUpgradeDecision(page);

  await expect(stageOf(page)).not.toHaveClass(/is-live/);
  await expect(demoIframeOf(page)).toHaveCount(0);
  await expect(liveLayerOf(page)).toBeHidden();
  expect(demoRequests).toEqual([]);
});
