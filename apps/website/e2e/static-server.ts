import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { applySecurityHeaders } from '../functions/_middleware';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/**
 * Resolve a request path inside `distDir`, or null if it escapes. Containment is
 * checked BEFORE any filesystem access, and against `distDir + sep` so a sibling
 * like `<dist>-evil` can't satisfy a bare prefix match.
 */
export function resolveWithinDist(distDir: string, urlPath: string): string | null {
  const root = resolve(distDir);
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }

  // Cloudflare Pages "clean URLs": /player resolves to /player.html on disk.
  if (extname(candidate) === '' && !existsSync(candidate)) {
    return `${candidate}.html`;
  }
  return candidate;
}

/**
 * Serves `dist/` with the REAL middleware headers (via applySecurityHeaders) instead
 * of a hand-copied CSP string, so these specs test what actually ships and can't
 * silently drift from functions/_middleware.ts. `playerFrameAncestors` overrides the
 * default allowlist — see apps/browser-extension/e2e/player-frame-ancestors.spec.ts.
 */
export function startSite(
  distDir: string,
  port: number,
  playerFrameAncestors?: string
): Promise<Server> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const filePath = resolveWithinDist(distDir, urlPath);

    if (filePath === null || !existsSync(filePath)) {
      res.writeHead(404).end('Not found');
      return;
    }

    const ext = extname(filePath);
    const body = await readFile(filePath);
    const upstream = new Response(body, {
      headers: { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' },
    });
    const withHeaders = applySecurityHeaders(urlPath, upstream, playerFrameAncestors);

    res.writeHead(200, Object.fromEntries(withHeaders.headers.entries()));
    res.end(body);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject); // e.g. EADDRINUSE — otherwise the caller hangs with no reason why
    server.listen(port, () => resolve(server));
  });
}

/**
 * Serves `dist/` with NO security headers at all — used by the network-leak spec,
 * which must isolate "does the nocookie switch itself stop the ad/tracking leak"
 * from CSP's frame-src (a separate defense-in-depth layer, covered by its own spec).
 */
export function startPlainSite(distDir: string, port: number): Promise<Server> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const filePath = resolveWithinDist(distDir, urlPath);

    if (filePath === null || !existsSync(filePath)) {
      res.writeHead(404).end('Not found');
      return;
    }

    const ext = extname(filePath);
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(body);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}

/** Minimal server for an "attacker" origin that tries to iframe the player. */
export function startAttacker(html: string, port: number): Promise<Server> {
  const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}
