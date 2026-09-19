import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, type Page, type Worker } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_ROOT = path.resolve(__dirname, '..');
export const EXTENSION_DIST = path.join(EXTENSION_ROOT, 'dist');

/** Builds into dist. `env` reaches the vite build, e.g. VITE_PLAYER_ORIGIN. */
export function buildExtension(env: NodeJS.ProcessEnv = {}): void {
  execFileSync('pnpm', ['--filter', '@cuewise/browser-extension', 'build'], {
    cwd: EXTENSION_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

export interface ExtensionSession {
  context: BrowserContext;
  worker: Worker;
  /** Derived by Chrome from the extension's path, so stable across launches of the same dir. */
  extensionId: string;
}

/**
 * An empty `profileDir` is a fresh temp profile; reuse one to stage a restart or an update. Headed,
 * as MV3 service workers never register under `--headless=new` here (15s timeout, confirmed).
 */
export async function launchExtension(
  options: { extensionDir?: string; profileDir?: string } = {}
): Promise<ExtensionSession> {
  const extensionDir = options.extensionDir ?? EXTENSION_DIST;
  const context = await chromium.launchPersistentContext(options.profileDir ?? '', {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return { context, worker, extensionId: new URL(worker.url()).host };
}

/** The new-tab page, past the welcome dialog a fresh profile shows once. */
export async function openNewTab(session: ExtensionSession): Promise<Page> {
  const page = session.context.pages()[0] ?? (await session.context.newPage());
  await page.goto(`chrome-extension://${session.extensionId}/index.html`);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  return page;
}
