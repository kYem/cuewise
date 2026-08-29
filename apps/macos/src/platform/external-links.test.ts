// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openMock = vi.fn<(url: string) => Promise<void>>();
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (url: string) => openMock(url),
}));

import { installExternalLinks } from './external-links';

let stop: () => void;

beforeEach(() => {
  openMock.mockReset().mockResolvedValue(undefined);
  document.body.innerHTML = '';
  stop = installExternalLinks();
});

afterEach(() => {
  stop();
});

/** Mirrors QuickLinksWidget: an anchor whose only child is what the user actually clicks. */
function renderLink(href: string, target = '_blank'): HTMLElement {
  document.body.innerHTML = `<a href="${href}" target="${target}"><span id="icon">go</span></a>`;
  const icon = document.getElementById('icon');
  if (icon === null) {
    throw new Error('fixture did not render');
  }
  return icon;
}

describe('installExternalLinks', () => {
  it('hands a pinned link to the system browser, which the webview would otherwise cancel', () => {
    const icon = renderLink('https://example.com/');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    icon.dispatchEvent(event);

    expect(openMock).toHaveBeenCalledWith('https://example.com/');
    // Without this the webview still tries, and silently drops the navigation.
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves an in-app link alone, so hash routing still works', () => {
    const icon = renderLink('#pomodoro', '');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    icon.dispatchEvent(event);

    expect(openMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'smb://host/share',
  ])('refuses to hand %s to the OS, since quick-link URLs are typed by the user', (href) => {
    const icon = renderLink(href);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    icon.dispatchEvent(event);

    expect(openMock).not.toHaveBeenCalled();
  });

  it('stops intercepting once disposed', () => {
    const icon = renderLink('https://example.com/');
    stop();

    icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(openMock).not.toHaveBeenCalled();
  });
});
