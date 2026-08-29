import { logger } from '@cuewise/shared';
import { open } from '@tauri-apps/plugin-shell';

const EXTERNAL_SCHEMES = new Set(['http:', 'https:']);

function externalHref(anchor: HTMLAnchorElement): string | null {
  if (anchor.target !== '_blank') {
    return null;
  }
  try {
    // Quick-link URLs are typed by the user and this hands them to the OS, so the scheme is
    // an allowlist: javascript:, file: and smb: must never reach `open`.
    const url = new URL(anchor.href, window.location.href);
    return EXTERNAL_SCHEMES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * WKWebView cancels a `target="_blank"` navigation outright unless the shell registers a
 * new-window handler, so every external link in the reused UI is a dead click without this.
 * Delegated, so the shared UI needs no macOS-specific markup. Returns a disposer.
 */
export function installExternalLinks(root: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    const href = externalHref(anchor);
    if (href === null) {
      return;
    }
    event.preventDefault();
    open(href).catch((error: unknown) => {
      logger.error('Could not open an external link', error);
    });
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
