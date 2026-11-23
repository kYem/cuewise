export const DEMO_STEPS = /** @type {const} */ ([
  'today',
  'pomodoro',
  'focus',
  'recall',
  'insights',
  'themes',
]);
const LIGHT_THEMES = ['purple', 'forest', 'rose'];

/**
 * Steers the app running in `win`: a frame's contentWindow, or `window` itself. The `themes` step
 * reloads `win`, so use it only for a framed app.
 * @param {Window} win
 * @param {Storage} storage
 * @returns {{ go(step: string): Promise<boolean> }}
 */
export function createDemoRemote(win, storage) {
  const doc = () => win.document;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(test, timeoutMs = 4000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (test()) {
        return true;
      }
      await sleep(100);
    }
    return test();
  }
  // biome-ignore lint/performance/useDomNodeTextContent: hidden views must not match
  const text = () => doc().body?.innerText ?? '';
  const appReady = () => (doc().getElementById('root')?.childElementCount ?? 0) > 0;
  const theme = () => doc().documentElement?.getAttribute('data-theme') ?? null;
  const focusOpen = () => doc().querySelector('[role="dialog"][aria-label="Focus mode"]') !== null;
  const cardShown = () => /Bring it to mind|How well did you recall it/.test(text());
  const onHome = () => doc().querySelector('input[aria-label="Add a goal"]') !== null;
  const enterFocus = () =>
    /** @type {HTMLElement | null} */ (
      doc().querySelector('button[title="Enter focus mode"], button[aria-label="Enter focus mode"]')
    );
  const press = (key) =>
    doc().body?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );

  async function setTheme(name) {
    if (theme() === name) {
      return true;
    }
    storage.setItem('settings.colorTheme', JSON.stringify(name));
    win.location.reload();
    await sleep(150);
    return until(() => appReady() && theme() === name, 6000);
  }

  async function closeFocus() {
    if (!focusOpen()) {
      return true;
    }
    press('Escape');
    return until(() => !focusOpen());
  }

  async function toPage(hash, ready) {
    if (win.location.hash.slice(1) !== hash) {
      const url = new URL(win.location.href);
      url.hash = hash;
      win.history.replaceState(win.history.state, '', url);
      win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    }
    return until(ready);
  }

  async function ensureCard(want) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (cardShown() === want) {
        return true;
      }
      press('c');
      if (await until(() => cardShown() === want, 2000)) {
        return true;
      }
    }
    return false;
  }

  async function showHome(withCard) {
    if (!(await closeFocus()) || !(await toPage('', onHome))) {
      return false;
    }
    return ensureCard(withCard);
  }

  async function showPage(hash, ready) {
    if (!(await closeFocus())) {
      return false;
    }
    return toPage(hash, ready);
  }

  const steps = {
    today: () => showHome(false),
    pomodoro: () => showPage('pomodoro', () => /Focus Session/.test(text())),
    async focus() {
      if (focusOpen()) {
        return true;
      }
      if (!(await toPage('pomodoro', () => enterFocus() !== null))) {
        return false;
      }
      enterFocus()?.click();
      return until(focusOpen);
    },
    recall: () => showHome(true),
    insights: () => showPage('insights', () => /Current Streak/.test(text())),
    async themes() {
      if (!(await showHome(false))) {
        return false;
      }
      const current = LIGHT_THEMES.indexOf(theme() ?? '');
      return setTheme(
        current === -1 ? 'purple' : LIGHT_THEMES[(current + 1) % LIGHT_THEMES.length]
      );
    },
  };

  async function perform(step) {
    if (step !== 'themes' && !(await setTheme('glass'))) {
      return false;
    }
    return steps[step]();
  }

  let latest = 0;
  let queue = Promise.resolve();

  return {
    go(step) {
      if (!Object.hasOwn(steps, step)) {
        return Promise.resolve(false);
      }
      latest += 1;
      const mine = latest;
      const run = queue.then(() => (mine === latest ? perform(step) : false)).catch(() => false);
      queue = run;
      return run;
    },
  };
}
