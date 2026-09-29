import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveWithinDist } from './csp-static-server';

describe('resolveWithinDist', () => {
  let dist: string;
  let sibling: string;

  beforeAll(() => {
    const base = mkdtempSync(join(tmpdir(), 'cuewise-csp-'));
    dist = join(base, 'dist');
    sibling = `${dist}-evil`;
    writeFileSync(resolve(base, 'secret.txt'), 'SECRET');
    mkdirSync(join(dist, 'feedback'), { recursive: true });
    writeFileSync(join(dist, 'feedback', 'index.html'), '<!doctype html>');
  });

  it('resolves a normal file inside dist', () => {
    expect(resolveWithinDist(dist, '/app.js')).toBe(join(dist, 'app.js'));
  });

  it('maps / to index.html', () => {
    expect(resolveWithinDist(dist, '/')).toBe(join(dist, 'index.html'));
  });

  it('maps a directory to its index.html, with or without the trailing slash', () => {
    expect(resolveWithinDist(dist, '/feedback/')).toBe(join(dist, 'feedback', 'index.html'));
    expect(resolveWithinDist(dist, '/feedback')).toBe(join(dist, 'feedback', 'index.html'));
  });

  it.each([
    ['a parent escape', '/../secret.txt'],
    ['an encoded slash traversal', '/..%2Fsecret.txt'],
    ['a fully-encoded traversal', '/%2e%2e%2fsecret.txt'],
    ['a malformed percent-encoding', '/%E0%A4%A'],
  ])('rejects %s', (_label, urlPath) => {
    expect(resolveWithinDist(dist, urlPath)).toBeNull();
  });

  it('rejects a sibling directory that shares the dist prefix', () => {
    expect(resolveWithinDist(dist, `/../${basename(sibling)}/x`)).toBeNull();
  });
});
