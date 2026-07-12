import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/**
 * Joins a tauri.conf.json CSP directive map into a header value the way Tauri's
 * own `Csp::DirectiveMap` does ("directive value" pairs joined by "; "). Directive
 * order is irrelevant to enforcement — each is parsed independently by the browser.
 */
export function buildCspHeader(directiveMap: Record<string, string>): string {
  return Object.entries(directiveMap)
    .map(([directive, sources]) => `${directive} ${sources}`)
    .join('; ');
}

/**
 * Minimal static file server standing in for Tauri's `tauri://` asset protocol,
 * which is what actually serves the production build and attaches the CSP as a
 * real response header (tauri crate `protocol/tauri.rs::get_response`, header set
 * only on `.html` responses — mirrors `manager/mod.rs`'s `is_html` gate, i.e. only
 * the navigated document, never subresources). A `<meta http-equiv=...>` tag can't
 * carry every directive (frame-ancestors/sandbox/report-uri are silently dropped
 * when set that way per the CSP spec), so this deliberately uses a header instead.
 */
export function startCspServer(distDir: string, csp: string, port: number): Promise<Server> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = normalize(join(distDir, relative));

    if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
      res.writeHead(404).end('Not found');
      return;
    }

    const ext = extname(filePath);
    const headers: Record<string, string> = {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
    };
    if (ext === '.html') {
      headers['Content-Security-Policy'] = csp;
    }

    const body = await readFile(filePath);
    res.writeHead(200, headers);
    res.end(body);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject); // e.g. EADDRINUSE — otherwise the caller hangs with no reason why
    server.listen(port, () => resolve(server));
  });
}
