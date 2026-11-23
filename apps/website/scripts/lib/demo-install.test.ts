import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeZip, text } from './__fixtures__/zip.fixtures';
import { installDemo, installOrder, readLock } from './demo-install.mts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'demo-install-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const read = (...parts: string[]) => readFileSync(path.join(dir, ...parts), 'utf8');

describe('installDemo', () => {
  it('writes the page and its assets and counts them', () => {
    const zip = makeZip([
      { name: 'index.html', data: text('<html></html>'), method: 8 },
      { name: 'assets/a.js', data: text('a'), method: 8 },
      { name: 'manifest.json', data: text('{}'), method: 8 },
    ]);
    expect(installDemo(zip, dir)).toBe(2);
    expect(read('demo', 'index.html')).toBe('<html></html>');
    expect(read('assets', 'a.js')).toBe('a');
  });

  it('replaces what an earlier install left behind', () => {
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'assets', 'old.js'), 'old');
    const zip = makeZip([
      { name: 'index.html', data: text('new'), method: 8 },
      { name: 'assets/a.js', data: text('a'), method: 8 },
    ]);
    installDemo(zip, dir);
    expect(() => read('assets', 'old.js')).toThrow(/ENOENT/);
  });

  it('refuses a zip with no index.html and leaves the installed page alone', () => {
    mkdirSync(path.join(dir, 'demo'));
    writeFileSync(path.join(dir, 'demo', 'index.html'), 'installed');
    const zip = makeZip([{ name: 'assets/a.js', data: text('a'), method: 8 }]);
    expect(() => installDemo(zip, dir)).toThrow(/index\.html/);
    expect(read('demo', 'index.html')).toBe('installed');
  });
});

describe('installOrder', () => {
  it('puts the page last so an interrupted install has no page', () => {
    expect(installOrder(['demo/index.html', 'assets/a.js', 'assets/b.js'])).toEqual([
      'assets/a.js',
      'assets/b.js',
      'demo/index.html',
    ]);
  });
});

describe('readLock', () => {
  const writeLock = (lock: object) =>
    writeFileSync(path.join(dir, 'demo.lock.json'), JSON.stringify(lock));

  it('reads the version and the hash', () => {
    writeLock({ version: '1.28.1', sha256: 'abc' });
    expect(readLock(dir)).toEqual({ version: '1.28.1', sha256: 'abc' });
  });

  it.each([{ version: '1.28.1' }, { sha256: 'abc' }])('rejects a lock that is %o', (lock) => {
    writeLock(lock);
    expect(() => readLock(dir)).toThrow('demo.lock.json needs a "version" and a "sha256"');
  });
});
