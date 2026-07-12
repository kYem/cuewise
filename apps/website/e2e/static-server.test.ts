import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveWithinDist } from './static-server';

// resolveWithinDist is the whole security boundary — HTTP clients normalise `../`
// away, so testing it through fetch() would be vacuous. Exercise it directly with
// the escapes a raw socket could send.
describe('resolveWithinDist', () => {
  let dist: string;
  let sibling: string; // "<dist>-evil" — shares a prefix with dist, the classic +sep bypass

  beforeAll(() => {
    const base = mkdtempSync(join(tmpdir(), 'cuewise-static-'));
    dist = join(base, 'dist');
    sibling = `${dist}-evil`;
    writeFileSync(resolve(base, 'secret.txt'), 'SECRET'); // a parent-directory secret
  });

  afterAll(() => {
    // tmp dirs are reaped by the OS; nothing to clean between runs.
  });

  it('resolves a normal file inside dist', () => {
    const r = resolveWithinDist(dist, '/player.js');
    expect(r).toBe(join(dist, 'player.js'));
  });

  it('maps / to index.html', () => {
    expect(resolveWithinDist(dist, '/')).toBe(join(dist, 'index.html'));
  });

  it('rejects a literal parent-escape (../)', () => {
    expect(resolveWithinDist(dist, '/../secret.txt')).toBeNull();
  });

  it('rejects a percent-encoded slash traversal (..%2F)', () => {
    // Only reachable because the server now decodes; the guard must still catch it.
    expect(resolveWithinDist(dist, '/..%2Fsecret.txt')).toBeNull();
  });

  it('rejects a fully-encoded traversal (%2e%2e%2f)', () => {
    expect(resolveWithinDist(dist, '/%2e%2e%2fsecret.txt')).toBeNull();
  });

  it('rejects a sibling dir that shares a prefix (the +sep bypass)', () => {
    // '<dist>-evil/x' startsWith '<dist>' is true — the bug a bare prefix check has.
    const escapePath = `/../${basename(sibling)}/x`;
    const r = resolveWithinDist(dist, escapePath);
    expect(r).toBeNull();
    if (r !== null) {
      expect(r.startsWith(dist + sep)).toBe(true); // would only pass for a genuine child
    }
  });

  it('rejects a malformed percent-encoding instead of throwing', () => {
    expect(resolveWithinDist(dist, '/%E0%A4%A')).toBeNull();
  });
});
