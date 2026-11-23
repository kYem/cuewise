import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { extractZip } from './unzip.mts';

const VERSION = /^\d+\.\d+\.\d+$/;
const ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 60_000;

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export function releaseAssetUrl(version: string): string {
  if (!VERSION.test(version)) {
    throw new Error(`Not a three-number version: ${version}`);
  }
  return `https://github.com/kYem/cuewise/releases/download/v${version}/cuewise-extension-${version}.zip`;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifySha256(bytes: Uint8Array, expectedHex: string): void {
  const actual = sha256Hex(bytes);
  if (actual !== expectedHex.toLowerCase()) {
    throw new Error(`Hash mismatch: expected ${expectedHex}, got ${actual}`);
  }
}

export function shouldFetch(pagesOnly: boolean, env: Record<string, string | undefined>): boolean {
  return !pagesOnly || env.CF_PAGES === '1';
}

export async function downloadRelease(
  version: string,
  { fetcher = fetch, retryDelayMs = 2000 }: { fetcher?: Fetcher; retryDelayMs?: number } = {}
): Promise<Uint8Array> {
  const url = releaseAssetUrl(version);
  let outcome = '';
  let cause: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await delay(retryDelayMs);
    }
    cause = undefined;
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
      outcome = `${response.status} ${response.statusText}`;
      if (response.status < 500) {
        break;
      }
    } catch (error) {
      outcome = 'no response';
      cause = error;
    }
  }
  throw new Error(`Download failed: ${outcome} (${url})`, cause === undefined ? {} : { cause });
}

export function demoFiles(zip: Uint8Array): Map<string, Uint8Array> {
  const extracted = extractZip(zip, (name) => name === 'index.html' || name.startsWith('assets/'));
  const index = extracted.get('index.html');
  if (index === undefined) {
    throw new Error('The release zip has no index.html');
  }
  extracted.delete('index.html');
  return new Map([['demo/index.html', index], ...extracted]);
}
