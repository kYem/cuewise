import { createHash } from 'node:crypto';
import { extractZip } from './unzip.mts';

const VERSION = /^\d+\.\d+\.\d+$/;

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

export async function downloadRelease(version: string): Promise<Uint8Array> {
  const url = releaseAssetUrl(version);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} (${url})`);
  }
  return new Uint8Array(await response.arrayBuffer());
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
