import { logger } from '@cuewise/shared';

// Document Picture-in-Picture is not in the TS DOM lib; declare the slice we use.
// Remove once lib.dom ships `Window.documentPictureInPicture` (it will then
// conflict with this augmentation via TS2717).
interface DocumentPictureInPictureApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

/** True when the browser supports the Document Picture-in-Picture API (Chrome/Edge 116+). */
export function isDocumentPipSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/**
 * Mirror the host page's theming into a freshly opened PiP window so Tailwind
 * classes and CSS-variable tokens resolve there too. Copies the <html> theming
 * attributes/classes (data-theme, data-density, .dark, .glass-enhanced — all set
 * on documentElement by settings-store). Every stylesheet is copied by inlining
 * its rules (dev = inline <style>, prod = same-origin linked CSS); cross-origin
 * sheets (fonts) can't be read, so they're re-linked by href instead. Styles are
 * copied once at open time, so a later theme change won't reflow the float until
 * it's reopened.
 */
export function syncPipWindowStyles(pip: Window): void {
  const srcRoot = document.documentElement;
  const dstRoot = pip.document.documentElement;

  dstRoot.className = srcRoot.className;
  for (const attr of ['data-theme', 'data-density']) {
    const value = srcRoot.getAttribute(attr);
    if (value !== null) {
      dstRoot.setAttribute(attr, value);
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const cssText = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('');
      const style = pip.document.createElement('style');
      style.textContent = cssText;
      pip.document.head.appendChild(style);
    } catch (error) {
      if (sheet.href) {
        // Expected: cross-origin sheet (e.g. Google Fonts) — cssRules throws; re-link by href.
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      } else {
        // Unexpected: a same-origin sheet we couldn't inline — don't drop it silently.
        logger.warn('Could not sync a stylesheet into the pomodoro pop-out', { error });
      }
    }
  }

  pip.document.body.style.margin = '0';
  // Opaque base so the float is never see-through: mirror the active theme's
  // opaque <html> background (glass's translucent surface then layers over it).
  pip.document.body.style.backgroundColor = getComputedStyle(srcRoot).backgroundColor;
}
