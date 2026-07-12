import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, onRequest } from './_middleware';

function makeUpstreamResponse(): Response {
  return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
}

describe('applySecurityHeaders', () => {
  it('sends the locked-down site CSP for the home page', () => {
    const response = applySecurityHeaders('/', makeUpstreamResponse());
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );
  });

  it('sends the locked-down site CSP for an inner page', () => {
    const response = applySecurityHeaders('/privacy/', makeUpstreamResponse());
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('sends the frame-friendly player CSP for /player.html', () => {
    const response = applySecurityHeaders('/player.html', makeUpstreamResponse());
    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; frame-src https://www.youtube-nocookie.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors chrome-extension://abjkbnhoepcnmbabflkedbapbldnpkbf tauri://localhost http://localhost:1420"
    );
  });

  it('sends the same player CSP for the extensionless /player path', () => {
    const response = applySecurityHeaders('/player', makeUpstreamResponse());
    expect(response.headers.get('Content-Security-Policy')).toBe(
      applySecurityHeaders('/player.html', makeUpstreamResponse()).headers.get(
        'Content-Security-Policy'
      )
    );
  });

  it('lists all three legitimate embedder origins in frame-ancestors', () => {
    const csp = applySecurityHeaders('/player', makeUpstreamResponse()).headers.get(
      'Content-Security-Policy'
    );
    expect(csp).toContain('chrome-extension://abjkbnhoepcnmbabflkedbapbldnpkbf');
    expect(csp).toContain('tauri://localhost');
    expect(csp).toContain('http://localhost:1420');
  });

  it('sets exactly one Content-Security-Policy header value on the site', () => {
    const response = applySecurityHeaders('/', makeUpstreamResponse());
    const values = [...response.headers.entries()].filter(
      ([name]) => name.toLowerCase() === 'content-security-policy'
    );
    expect(values).toHaveLength(1);
  });

  it('sets exactly one Content-Security-Policy header value on the player', () => {
    const response = applySecurityHeaders('/player.html', makeUpstreamResponse());
    const values = [...response.headers.entries()].filter(
      ([name]) => name.toLowerCase() === 'content-security-policy'
    );
    expect(values).toHaveLength(1);
  });

  it('sends HSTS and a locked-down Permissions-Policy on every response', () => {
    for (const pathname of ['/', '/privacy/', '/player.html', '/player']) {
      const response = applySecurityHeaders(pathname, makeUpstreamResponse());
      expect(response.headers.get('Strict-Transport-Security')).toBe(
        'max-age=63072000; includeSubDomains; preload'
      );
      expect(response.headers.get('Permissions-Policy')).toBe(
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
      );
    }
  });

  it('keeps X-Content-Type-Options and Referrer-Policy on every response', () => {
    for (const pathname of ['/', '/player.html']) {
      const response = applySecurityHeaders(pathname, makeUpstreamResponse());
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    }
  });

  it('never sends X-Frame-Options — frame-ancestors is the sole framing control', () => {
    for (const pathname of ['/', '/player.html', '/player']) {
      const response = applySecurityHeaders(pathname, makeUpstreamResponse());
      expect(response.headers.get('X-Frame-Options')).toBeNull();
    }
  });

  it('preserves headers already set by the upstream response', () => {
    const response = applySecurityHeaders('/', makeUpstreamResponse());
    expect(response.headers.get('Content-Type')).toBe('text/html');
  });
});

describe('onRequest', () => {
  it('reads the pathname from the request and applies the matching CSP', async () => {
    const response = await onRequest({
      request: new Request('https://cuewise.app/player.html?v=jfKfPfyJRdk'),
      next: () => Promise.resolve(makeUpstreamResponse()),
    });
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'frame-src https://www.youtube-nocookie.com'
    );
  });
});
