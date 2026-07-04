import { afterEach, describe, expect, it } from 'vitest';
import { isDocumentPipSupported, syncPipWindowStyles } from './pip-window';

// A typed view of window for toggling the optional API without `any`.
const testWindow = window as unknown as { documentPictureInPicture?: unknown };

describe('isDocumentPipSupported', () => {
  afterEach(() => {
    delete testWindow.documentPictureInPicture;
  });

  it('is false when the Document Picture-in-Picture API is absent', () => {
    expect(isDocumentPipSupported()).toBe(false);
  });

  it('is true when the API is present', () => {
    testWindow.documentPictureInPicture = { requestWindow: () => Promise.resolve(window) };
    expect(isDocumentPipSupported()).toBe(true);
  });
});

describe('syncPipWindowStyles', () => {
  // A minimal Window-shaped stand-in backed by a real detached document.
  function createFakePip(): Window {
    return { document: document.implementation.createHTMLDocument('pip') } as unknown as Window;
  }

  const addedStyles: HTMLStyleElement[] = [];

  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.backgroundColor = '';
    // Restore the native styleSheets accessor if a test stubbed it.
    Reflect.deleteProperty(document, 'styleSheets');
    for (const style of addedStyles) {
      style.remove();
    }
    addedStyles.length = 0;
  });

  it('mirrors the theme class and data-theme/data-density onto the pip root', () => {
    document.documentElement.className = 'dark glass-enhanced';
    document.documentElement.setAttribute('data-theme', 'forest');
    document.documentElement.setAttribute('data-density', 'compact');

    const pip = createFakePip();
    syncPipWindowStyles(pip);

    expect(pip.document.documentElement.className).toBe('dark glass-enhanced');
    expect(pip.document.documentElement.getAttribute('data-theme')).toBe('forest');
    expect(pip.document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('copies host stylesheets into the pip head and mirrors the html background', () => {
    // The float's opaque base is the active theme's <html> background.
    document.documentElement.style.backgroundColor = 'rgb(1, 2, 3)';
    const style = document.createElement('style');
    style.textContent = '.pip-probe{color:red}';
    document.head.appendChild(style);
    addedStyles.push(style);

    const pip = createFakePip();
    syncPipWindowStyles(pip);

    expect(pip.document.head.querySelectorAll('style').length).toBeGreaterThan(0);
    expect(pip.document.body.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('re-links cross-origin sheets by href when their rules are unreadable', () => {
    // Cross-origin stylesheets throw on .cssRules; the fallback must re-link by href.
    const crossOrigin = {
      get cssRules(): CSSRuleList {
        throw new Error('cross-origin');
      },
      href: 'https://fonts.example/x.css',
    };
    Object.defineProperty(document, 'styleSheets', { configurable: true, value: [crossOrigin] });

    const pip = createFakePip();
    syncPipWindowStyles(pip);

    expect(
      pip.document.head.querySelector('link[href="https://fonts.example/x.css"]')
    ).not.toBeNull();
  });
});
