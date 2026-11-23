#!/usr/bin/env -S node
/**
 * Downloads the pinned extension release (demo.lock.json), checks its hash and unpacks the demo
 * page and its assets into public/.
 *
 * Usage (from apps/website):
 *   pnpm demo:fetch
 *   pnpm demo:fetch --pages-only   # only on a Cloudflare Pages build (CF_PAGES=1), else a no-op
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { demoFiles, downloadRelease, verifySha256 } from './lib/demo-artifact.mts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const { values } = parseArgs({ options: { 'pages-only': { type: 'boolean' } } });

async function main() {
  if (values['pages-only'] && process.env.CF_PAGES !== '1') {
    return;
  }
  const lock = JSON.parse(readFileSync(path.join(root, 'demo.lock.json'), 'utf8'));
  const zip = await downloadRelease(lock.version);
  verifySha256(zip, lock.sha256);
  const files = demoFiles(zip);

  rmSync(path.join(publicDir, 'demo'), { recursive: true, force: true });
  rmSync(path.join(publicDir, 'assets'), { recursive: true, force: true });
  for (const [name, bytes] of files) {
    const target = path.join(publicDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  console.log(`demo ${lock.version}: ${files.size} files`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
