import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for ENG-47: a CSP without Tauri's own IPC sources breaks
// invoke() and plugin calls (e.g. the notification plugin's `is_permission_granted`)
// on macOS. tauri.conf.json is strict JSON (no config-json5 feature enabled, so it
// can't hold a comment — confirmed: adding one fails the Rust build) — this test
// carries the explanation and the enforcement `git blame`/PR review otherwise would.
// `ipc:` covers macOS/iOS (`ipc://localhost/{cmd}`); `http://ipc.localhost` covers
// Windows/Linux (WebView2/WebKitGTK) — Tauri's own docs list both as required
// `connect-src` sources: https://v2.tauri.app/reference/config/#securityconfig

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'tauri.conf.json');
const REQUIRED_IPC_SOURCES = ['ipc:', 'http://ipc.localhost'];

function connectSrcSources(directives: unknown): string[] {
  if (typeof directives !== 'object' || directives === null || !('connect-src' in directives)) {
    throw new Error('tauri.conf.json security config is missing a `connect-src` directive');
  }
  const connectSrc = (directives as Record<string, unknown>)['connect-src'];
  if (typeof connectSrc !== 'string') {
    throw new Error('`connect-src` is expected to be a space-separated string of sources');
  }
  return connectSrc.split(/\s+/).filter(Boolean);
}

describe('tauri.conf.json CSP allows Tauri IPC', () => {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

  it('csp.connect-src includes the Tauri IPC sources', () => {
    const sources = connectSrcSources(config.app.security.csp);
    for (const required of REQUIRED_IPC_SOURCES) {
      expect(sources, `csp.connect-src is missing "${required}"`).toContain(required);
    }
  });

  it('devCsp.connect-src includes the Tauri IPC sources', () => {
    const sources = connectSrcSources(config.app.security.devCsp);
    for (const required of REQUIRED_IPC_SOURCES) {
      expect(sources, `devCsp.connect-src is missing "${required}"`).toContain(required);
    }
  });
});
