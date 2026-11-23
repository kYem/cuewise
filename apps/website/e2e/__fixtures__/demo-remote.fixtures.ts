import { dayKey, writeDemoSeed } from '../../public/scripts/demo-seed.js';
import { fakeStorage } from './storage.fixtures';

const FOCUS_DIALOG = '[role="dialog"][aria-label="Focus mode"]';
const HOME_INPUT = 'input[aria-label="Add a goal"]';
const PHOTO_LAYER = '[style*="background-image"]';
const DEMO_URL = 'http://localhost/demo/';

export function throwingWindow(): Window {
  return {
    get document(): Document {
      throw new Error('document is gone');
    },
  } as unknown as Window;
}

export function documentMidNavigation(): Window {
  return {
    document: {
      documentElement: null,
      body: null,
      getElementById: () => null,
      querySelector: (selector: string) => (selector === HOME_INPUT ? {} : null),
    },
    location: { hash: '', reload: () => undefined },
  } as unknown as Window;
}

export function bodylessWindowWithFocusDialogClosingOnItsOwn(): Window {
  let dialogChecks = 0;
  return {
    document: {
      documentElement: { getAttribute: () => 'glass' },
      body: null,
      getElementById: () => null,
      querySelector: (selector: string) => {
        if (selector === FOCUS_DIALOG) {
          dialogChecks += 1;
          return dialogChecks === 1 ? {} : null;
        }
        return {};
      },
    },
    getComputedStyle: () => ({ opacity: '1' }),
    location: { hash: '' },
  } as unknown as Window;
}

/** The glass photo layer: not in the page yet, in the page but fading in, or fully shown. */
export type FakePhoto = 'absent' | 'fading' | 'shown';

export interface FakeAppWindow {
  win: Window;
  events: string[];
  showPhoto(): void;
}

/** A window that shows the pomodoro page at `#pomodoro`, the insights page at `#insights`, else home. */
export function fakeAppWindow(
  storage: Storage,
  startHash = '',
  startPhoto: FakePhoto = 'shown'
): FakeAppWindow {
  const events: string[] = [];
  let hash = startHash;
  let theme = 'glass';
  let photo = startPhoto;
  const text = () => {
    if (hash === 'pomodoro') {
      return 'Focus Session';
    }
    return hash === 'insights' ? 'Current Streak' : '';
  };

  const win = {
    document: {
      documentElement: { getAttribute: () => theme },
      body: {
        get innerText() {
          return text();
        },
        dispatchEvent(event: { type: string; key?: string }) {
          events.push(`${event.type} ${event.key}`);
          return true;
        },
      },
      getElementById: () => ({ childElementCount: 1 }),
      querySelector: (selector: string) => {
        if (selector === PHOTO_LAYER) {
          return photo === 'absent' ? null : {};
        }
        return selector === HOME_INPUT && hash === '' ? {} : null;
      },
    },
    getComputedStyle: () => ({ opacity: photo === 'shown' ? '1' : '0.09' }),
    KeyboardEvent: class {
      constructor(
        readonly type: string,
        init: { key: string }
      ) {
        this.key = init.key;
      }
      readonly key: string;
    },
    location: {
      get href() {
        return hash === '' ? DEMO_URL : `${DEMO_URL}#${hash}`;
      },
      get hash() {
        return hash === '' ? '' : `#${hash}`;
      },
      set hash(value: string) {
        events.push(`assigned hash ${value}`);
        hash = value.replace(/^#/, '');
      },
      reload() {
        events.push('reload');
        theme = JSON.parse(storage.getItem('settings.colorTheme') ?? JSON.stringify(theme));
      },
    },
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, url: URL) {
        events.push(`replaceState ${url.href}`);
        hash = url.hash.replace(/^#/, '');
      },
    },
    HashChangeEvent: class {
      constructor(readonly type: string) {}
    },
    dispatchEvent(event: { type: string }) {
      events.push(event.type);
      return true;
    },
  };
  return {
    win: win as unknown as Window,
    events,
    showPhoto() {
      photo = 'shown';
    },
  };
}

export function trackSettled(promise: Promise<unknown>) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  return {
    get settled() {
      return settled;
    },
  };
}

/** Demo storage as the page seeds it, with the one card due today either kept or pushed out. */
export function seededStorage({ cardDue }: { cardDue: boolean }): Storage {
  const now = new Date();
  const storage = fakeStorage();
  writeDemoSeed(storage, now);
  if (!cardDue) {
    const today = dayKey(now);
    const cards: { schedule: { dueDate: string } }[] = JSON.parse(
      storage.getItem('conceptCards') ?? '[]'
    );
    storage.setItem(
      'conceptCards',
      JSON.stringify(cards.filter((card) => card.schedule.dueDate > today))
    );
  }
  return storage;
}
