import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { demoFiles, downloadRelease, verifySha256 } from './demo-artifact.mts';

const PAGE = 'demo/index.html';

export function readLock(root: string): { version: string; sha256: string } {
  const lock = JSON.parse(readFileSync(path.join(root, 'demo.lock.json'), 'utf8'));
  if (typeof lock.version !== 'string' || typeof lock.sha256 !== 'string') {
    throw new Error('demo.lock.json needs a "version" and a "sha256"');
  }
  return { version: lock.version, sha256: lock.sha256 };
}

// The page goes last, so an interrupted install never leaves a page without its assets.
export function installOrder(names: Iterable<string>): string[] {
  const all = [...names];
  return [...all.filter((name) => name !== PAGE), ...all.filter((name) => name === PAGE)];
}

export function installDemo(zip: Uint8Array, publicDir: string): number {
  const files = demoFiles(zip);
  rmSync(path.join(publicDir, 'demo'), { recursive: true, force: true });
  rmSync(path.join(publicDir, 'assets'), { recursive: true, force: true });
  for (const name of installOrder(files.keys())) {
    const bytes = files.get(name);
    if (bytes === undefined) {
      throw new Error(`Missing ${name}`);
    }
    const target = path.join(publicDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return files.size;
}

export async function fetchPinnedDemo(root: string): Promise<{ version: string; files: number }> {
  const lock = readLock(root);
  const zip = await downloadRelease(lock.version);
  verifySha256(zip, lock.sha256);
  return { version: lock.version, files: installDemo(zip, path.join(root, 'public')) };
}
