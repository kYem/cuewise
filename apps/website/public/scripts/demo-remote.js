import { dayKey } from './demo-seed.js';

export const DEMO_STEPS = /** @type {const} */ ([
  'today',
  'pomodoro',
  'focus',
  'recall',
  'insights',
  'themes',
]);
const LIGHT_THEMES = ['purple', 'forest', 'rose'];
export const PHOTO_WAIT_MS = 4000;

/** True once the glass theme's photo has faded in; the app adds that layer only after the photo loads. */
export function photoShown(win) {
  const photo = win.document.querySelector('[style*="background-image"]');
  return photo !== null && win.getComputedStyle(photo).opacity === '1';
}

/**
 * Steers the app running in `win`: a frame's contentWindow, or `window` itself. A theme change
 * reloads `win` (`themes` always, other steps when the theme is not glass), which ends a top-level
 * caller.
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
      new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );
  const cardIsDue = () => {
    const today = dayKey(new Date());
    return JSON.parse(storage.getItem('conceptCards') ?? '[]').some(
      (card) => card.schedule.dueDate <= today
    );
  };

  let photoMissed = false;

  async function setTheme(name) {
    if (theme() !== name) {
      storage.setItem('settings.colorTheme', JSON.stringify(name));
      win.location.reload();
      await sleep(150);
      if (!(await until(() => appReady() && theme() === name, 6000))) {
        return false;
      }
    }
    if (name === 'glass' && !photoMissed) {
      photoMissed = !(await until(() => photoShown(win), PHOTO_WAIT_MS));
    }
    return true;
  }

  async function closeFocus() {
    if (!focusOpen()) {
      return true;
    }
    press('Escape');
    return until(() => !focusOpen());
  }

  async function toPage(hash, ready) {
    // Not `location.hash`: that adds a Back entry per step and scrolls the embedding page.
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

  async function goHome() {
    return (await closeFocus()) && (await toPage('', onHome));
  }

  async function showHome(withCard) {
    return (await goHome()) && (await ensureCard(withCard));
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
    async recall() {
      if (!(await goHome())) {
        return false;
      }
      if (cardIsDue()) {
        await ensureCard(true);
      }
      return true;
    },
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
      const run = queue
        .then(() => (mine === latest ? perform(step) : false))
        .catch((error) => {
          console.warn(`Cuewise demo: step "${step}" threw`, error);
          return false;
        });
      queue = run;
      return run;
    },
  };
}
