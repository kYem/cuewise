import { createDemoRemote, DEMO_STEPS } from './demo-remote.js';
import { writeDemoSeed } from './demo-seed.js';

const DWELL_MS = 5200;
const MIN_VISIBLE_RATIO = 0.35;
const DEMO_URL = '/demo/';
const DEMO_WIDTH = 1440;
const DEMO_HEIGHT = 810;
const READY_TIMEOUT_MS = 12000;
const READY_POLL_MS = 100;

function canRunLive() {
  const brands = navigator.userAgentData?.brands ?? [];
  const chromium = brands.some((brand) => brand.brand === 'Chromium');
  const desktop = matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
  return chromium && desktop && navigator.connection?.saveData !== true;
}

function frameRoot(frame) {
  try {
    return frame.contentDocument?.getElementById('root') ?? null;
  } catch {
    return null;
  }
}

function appRendered(frame) {
  const root = frameRoot(frame);
  return (
    root !== null && root.childElementCount > 0 && /Today's Focus/.test(root.textContent ?? '')
  );
}

// A fragment navigation inside the frame scrolls the page that embeds it.
function keepPageStillOnFragmentNavigation(frame) {
  if (frameRoot(frame) === null) {
    return;
  }
  frame.contentWindow?.navigation?.addEventListener('navigate', (event) => {
    if (event.hashChange) {
      const { scrollX, scrollY } = window;
      requestAnimationFrame(() =>
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
      );
    }
  });
}

function waitForApp(frame) {
  return new Promise((resolve) => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let timer = 0;

    function settle(outcome) {
      window.clearTimeout(timer);
      frame.removeEventListener('load', onLoad);
      resolve(outcome);
    }

    function onLoad() {
      if (frameRoot(frame) === null) {
        settle('not-the-app');
      }
    }

    function poll() {
      if (appRendered(frame)) {
        settle('ready');
      } else if (Date.now() >= deadline) {
        settle('not-rendered');
      } else {
        timer = window.setTimeout(poll, READY_POLL_MS);
      }
    }

    frame.addEventListener('load', onLoad);
    poll();
  });
}

function init(stage) {
  const shots = new Map();
  for (const shot of stage.querySelectorAll('.stage-shot[data-step]')) {
    shots.set(shot.dataset.step, shot);
  }
  const buttons = [...stage.querySelectorAll('.dock button[data-step]')];
  const caption = stage.querySelector('[data-stage-caption]');
  const liveLayer = stage.querySelector('[data-stage-live]');
  const note = stage.querySelector('[data-stage-note]');
  const cta = document.querySelector('[data-stage-cta]');
  const screenshotNote = note?.textContent ?? '';
  let current = DEMO_STEPS[0];
  let remote = null;
  let steering = 0;
  let touring = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inView = false;
  let timer = 0;

  if (touring) {
    caption?.setAttribute('aria-live', 'off');
  }

  function stopTour() {
    touring = false;
    window.clearTimeout(timer);
    caption?.setAttribute('aria-live', 'polite');
  }

  function load(shot) {
    if (!shot.getAttribute('src') && shot.dataset.src) {
      shot.src = shot.dataset.src;
    }
  }

  function show(step) {
    if (!shots.has(step)) {
      return;
    }
    current = step;
    for (const [key, shot] of shots) {
      const on = key === step;
      if (on) {
        load(shot);
      }
      shot.classList.toggle('is-on', on);
      shot.setAttribute('aria-hidden', String(!on));
    }
    for (const button of buttons) {
      const on = button.dataset.step === step;
      button.setAttribute('aria-pressed', String(on));
      if (on && caption) {
        const title = document.createElement('strong');
        title.textContent = button.dataset.title ?? '';
        caption.replaceChildren(title, ` ${button.dataset.caption ?? ''}`);
      }
    }
  }

  function syncLiveLayer() {
    if (liveLayer) {
      liveLayer.inert =
        !stage.classList.contains('is-live') || stage.classList.contains('is-fallback');
    }
  }

  function setFallback(on) {
    stage.classList.toggle('is-fallback', on);
    syncLiveLayer();
  }

  function setNote(text) {
    if (note) {
      note.textContent = text;
    }
  }

  async function select(step) {
    show(step);
    if (!remote) {
      return;
    }
    steering += 1;
    const mine = steering;
    setFallback(true);
    const arrived = await remote.go(step);
    if (mine !== steering) {
      return;
    }
    if (arrived) {
      setNote(stage.dataset.noteLive);
      setFallback(false);
    } else {
      console.warn(`Cuewise demo: step "${step}" did not arrive, showing its screenshot`);
      setNote(screenshotNote);
    }
  }

  function advance() {
    const next = DEMO_STEPS[DEMO_STEPS.indexOf(current) + 1];
    if (next) {
      select(next);
      schedule();
      return;
    }
    select(DEMO_STEPS[0]);
    stopTour();
  }

  function schedule() {
    window.clearTimeout(timer);
    if (touring && inView && !document.hidden) {
      timer = window.setTimeout(advance, DWELL_MS);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      stopTour();
      select(button.dataset.step);
    });
  }

  new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1].intersectionRatio >= MIN_VISIBLE_RATIO;
      schedule();
    },
    { threshold: MIN_VISIBLE_RATIO }
  ).observe(stage);
  document.addEventListener('visibilitychange', schedule);

  function loadAll() {
    for (const shot of shots.values()) {
      load(shot);
    }
  }

  function trackScale() {
    const screen = stage.querySelector('.stage-screen');
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[entries.length - 1].contentRect;
      stage.style.setProperty('--demo-scale', String(width / DEMO_WIDTH));
    });
    observer.observe(screen);
    return observer;
  }

  async function goLive() {
    if (!liveLayer || !canRunLive()) {
      return;
    }
    try {
      writeDemoSeed(localStorage, new Date());
    } catch (error) {
      console.warn('Cuewise demo: could not write the sample data, showing screenshots', error);
      return;
    }

    const frame = document.createElement('iframe');
    frame.src = DEMO_URL;
    frame.title = 'Cuewise demo';
    frame.width = String(DEMO_WIDTH);
    frame.height = String(DEMO_HEIGHT);
    const scale = trackScale();
    const ready = waitForApp(frame);
    liveLayer.append(frame);
    liveLayer.hidden = false;

    const outcome = await ready;
    if (outcome !== 'ready') {
      console.warn(
        outcome === 'not-the-app'
          ? 'Cuewise demo: the frame loaded something that is not the app, showing screenshots'
          : `Cuewise demo: the app did not render within ${READY_TIMEOUT_MS / 1000}s, showing screenshots`
      );
      scale.disconnect();
      frame.remove();
      liveLayer.hidden = true;
      return;
    }

    remote = createDemoRemote(frame.contentWindow, localStorage);
    keepPageStillOnFragmentNavigation(frame);
    frame.addEventListener('load', () => {
      if (frameRoot(frame) === null) {
        setFallback(true);
        setNote(screenshotNote);
        return;
      }
      keepPageStillOnFragmentNavigation(frame);
    });
    window.addEventListener('blur', () => {
      if (document.activeElement === frame) {
        stopTour();
      }
    });
    select(current);
    stage.classList.add('is-live');
    syncLiveLayer();
    if (cta) {
      cta.textContent = stage.dataset.ctaLive;
    }
  }

  function upgrade() {
    loadAll();
    goLive();
  }

  function upgradeWhenIdle() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(upgrade);
    } else {
      window.setTimeout(upgrade, 200);
    }
  }

  syncLiveLayer();
  if (document.readyState === 'complete') {
    upgradeWhenIdle();
  } else {
    window.addEventListener('load', upgradeWhenIdle, { once: true });
  }
}

const stage = document.querySelector('[data-stage]');
if (stage) {
  init(stage);
}
