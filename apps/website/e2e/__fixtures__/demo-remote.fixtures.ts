const FOCUS_DIALOG = '[role="dialog"][aria-label="Focus mode"]';
const HOME_INPUT = 'input[aria-label="Add a goal"]';
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
    location: { hash: '' },
  } as unknown as Window;
}

export interface FakeAppWindow {
  win: Window;
  events: string[];
}

/** A window that shows the pomodoro page at `#pomodoro`, the insights page at `#insights`, else home. */
export function fakeAppWindow(storage: Storage, startHash = ''): FakeAppWindow {
  const events: string[] = [];
  let hash = startHash;
  let theme = 'glass';
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
      },
      getElementById: () => ({ childElementCount: 1 }),
      querySelector: (selector: string) => (selector === HOME_INPUT && hash === '' ? {} : null),
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
  return { win: win as unknown as Window, events };
}
