import type { Page } from '@playwright/test';

// Marks every stubbed response so assertNoRealNetworkEscapes() can tell a stub
// apart from an actual third-party reply.
export const STUB_HEADER = 'x-e2e-stub';

// A valid 1x1 transparent PNG — smallest fixture that satisfies `new Image()`'s
// onload handler (a truncated/empty body fires onerror instead).
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

/**
 * Routes every off-origin (non-localhost) request to a minimal local stub instead
 * of the real network, so third-party host rotation/outages (YouTube, Unsplash,
 * Google) can't flake CI. CSP is enforced before Playwright's routing ever sees the
 * request, so stubbing an ALLOWED request changes nothing about violation detection
 * — it only removes the live third-party dependency.
 *
 * Returns a getter for every stubbed request's URL, so a test can assert the
 * third-party requests it expects were actually made (not just that zero CSP
 * violations happened, which is also trivially true if nothing was requested).
 */
export async function stubThirdPartyRequests(page: Page): Promise<() => string[]> {
  const requested: string[] = [];

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') {
      await route.continue();
      return;
    }

    requested.push(route.request().url());
    const headers = { [STUB_HEADER]: '1' };

    // NOTE: google.com/s2/favicons really 301s to a *.gstatic.com host in
    // production (img-src allows both for that reason), but WebKit's route
    // interception can't emulate a redirect — `route.fulfill({ status: 301, ... })`
    // throws "Cannot fulfill with redirect status" (verified against Playwright
    // 1.61 / WebKit). So this stub answers the favicon request directly like any
    // other image, and the gstatic redirect target is untested by this harness —
    // see the comment on the img-src assertion in csp.spec.ts.
    switch (route.request().resourceType()) {
      case 'image':
        await route.fulfill({ status: 200, contentType: 'image/png', headers, body: ONE_PX_PNG });
        return;
      // The YouTube-player iframe's own document load (frame-src cuewise.app).
      case 'document':
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          headers,
          body: '<!doctype html><title>stub</title>',
        });
        return;
      // The oEmbed playlist-metadata lookup (connect-src youtube.com).
      case 'xhr':
      case 'fetch':
        await route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' });
        return;
      default:
        await route.fulfill({ status: 200, headers, body: '' });
    }
  });

  return () => requested;
}

/**
 * Starts watching for any response to a non-localhost URL that lacks our stub
 * marker — proof a request slipped past stubThirdPartyRequests() and hit the real
 * network. Call the returned getter after the test's interactions to assert on it.
 */
export function watchForRealNetworkEscapes(page: Page): () => string[] {
  const escaped: string[] = [];
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.hostname !== 'localhost' && response.headers()[STUB_HEADER] !== '1') {
      escaped.push(response.url());
    }
  });
  return () => escaped;
}
