import { DEMO_STEPS } from './demo-remote.js';

const DWELL_MS = 5200;
const MIN_VISIBLE_RATIO = 0.35;

function init(stage) {
  const shots = new Map();
  for (const shot of stage.querySelectorAll('.stage-shot[data-step]')) {
    shots.set(shot.dataset.step, shot);
  }
  const buttons = [...stage.querySelectorAll('.dock button[data-step]')];
  const caption = stage.querySelector('[data-stage-caption]');
  let current = DEMO_STEPS[0];
  let touring = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = 0;

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

  function advance() {
    const next = DEMO_STEPS[DEMO_STEPS.indexOf(current) + 1];
    if (next) {
      show(next);
      schedule();
      return;
    }
    touring = false;
    show(DEMO_STEPS[0]);
  }

  function schedule() {
    window.clearTimeout(timer);
    if (touring) {
      timer = window.setTimeout(advance, DWELL_MS);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      touring = false;
      window.clearTimeout(timer);
      show(button.dataset.step);
    });
  }

  new IntersectionObserver(
    (entries) => {
      if (entries[entries.length - 1].intersectionRatio >= MIN_VISIBLE_RATIO) {
        schedule();
      } else {
        window.clearTimeout(timer);
      }
    },
    { threshold: MIN_VISIBLE_RATIO }
  ).observe(stage);

  function loadAll() {
    for (const shot of shots.values()) {
      load(shot);
    }
  }

  function loadAllWhenIdle() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadAll);
    } else {
      window.setTimeout(loadAll, 200);
    }
  }

  if (document.readyState === 'complete') {
    loadAllWhenIdle();
  } else {
    window.addEventListener('load', loadAllWhenIdle, { once: true });
  }
}

const stage = document.querySelector('[data-stage]');
if (stage) {
  init(stage);
}
