#!/usr/bin/env -S node
/**
 * Pins the demo to an extension release: downloads it and records its version and sha256.
 *
 * Usage (from apps/website):
 *   pnpm demo:pin 1.28.1
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadRelease, sha256Hex } from './lib/demo-artifact.mts';

const lockPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo.lock.json');

async function main() {
  const version = process.argv[2];
  if (version === undefined) {
    throw new Error('Usage: pnpm demo:pin <version>');
  }
  const sha256 = sha256Hex(await downloadRelease(version));
  writeFileSync(lockPath, `${JSON.stringify({ version, sha256 }, null, 2)}\n`);
  console.log(sha256);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
