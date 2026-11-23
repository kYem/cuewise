#!/usr/bin/env -S node
/**
 * Downloads the pinned extension release (demo.lock.json), checks its hash and unpacks the demo
 * page and its assets into public/.
 *
 * Usage (from apps/website):
 *   pnpm demo:fetch
 *   pnpm demo:fetch --pages-only   # only on a Cloudflare Pages build (CF_PAGES=1), else a no-op
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { shouldFetch } from './lib/demo-artifact.mts';
import { fetchPinnedDemo } from './lib/demo-install.mts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({ options: { 'pages-only': { type: 'boolean' } } });

async function main() {
  if (!shouldFetch(values['pages-only'] === true, process.env)) {
    console.log('demo: skipped (not a Cloudflare Pages build)');
    return;
  }
  const { version, files } = await fetchPinnedDemo(root);
  console.log(`demo ${version}: ${files} files`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
