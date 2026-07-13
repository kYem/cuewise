import { describe, expect, it } from 'vitest';
import {
  HLC_MAX_DRIFT_MS,
  hlcCompare,
  hlcDecode,
  hlcEncode,
  hlcInit,
  hlcNow,
  hlcReceive,
} from './hlc';

describe('hlc', () => {
  it('hlcNow advances physical to the wall clock and resets counter', () => {
    const a = hlcInit('devA');
    const b = hlcNow(a, 1000);
    expect(b.physical).toBe(1000);
    expect(b.counter).toBe(0);
  });

  it('hlcNow bumps the counter when the wall clock has not advanced', () => {
    const a = hlcNow(hlcInit('devA'), 1000);
    const b = hlcNow(a, 1000);
    const c = hlcNow(b, 1000);
    expect(b.counter).toBe(1);
    expect(c.counter).toBe(2);
    expect(c.physical).toBe(1000);
  });

  it('hlcNow never goes backward when the wall clock jumps back', () => {
    const a = hlcNow(hlcInit('devA'), 5000);
    const b = hlcNow(a, 3000); // wall clock jumped backward
    expect(b.physical).toBe(5000);
    expect(b.counter).toBe(1);
  });

  it('encode/decode round-trips and preserves sort order', () => {
    const a = { physical: 1000, counter: 2, node: 'devA' };
    expect(hlcDecode(hlcEncode(a))).toEqual(a);
    const older = hlcEncode({ physical: 1000, counter: 1, node: 'devZ' });
    const newer = hlcEncode({ physical: 1000, counter: 2, node: 'devA' });
    expect(older < newer).toBe(true); // lexicographic = hlc order despite node
  });

  it('hlcCompare orders by physical, then counter, then node', () => {
    expect(
      hlcCompare({ physical: 1, counter: 0, node: 'a' }, { physical: 2, counter: 0, node: 'a' })
    ).toBe(-1);
    expect(
      hlcCompare({ physical: 1, counter: 1, node: 'a' }, { physical: 1, counter: 0, node: 'a' })
    ).toBe(1);
    expect(
      hlcCompare({ physical: 1, counter: 0, node: 'a' }, { physical: 1, counter: 0, node: 'b' })
    ).toBe(-1);
    expect(
      hlcCompare({ physical: 1, counter: 0, node: 'a' }, { physical: 1, counter: 0, node: 'a' })
    ).toBe(0);
  });

  it('hlcReceive advances past a newer remote and bumps counter', () => {
    const local = hlcNow(hlcInit('devA'), 1000);
    const remote = { physical: 2000, counter: 5, node: 'devB' };
    const merged = hlcReceive(local, remote, 1500);
    expect(merged.physical).toBe(2000);
    expect(merged.counter).toBe(6);
    expect(merged.node).toBe('devA'); // our node id is preserved
  });

  it('hlcReceive clamps an absurdly-future remote to wall + drift bound', () => {
    const local = hlcNow(hlcInit('devA'), 1000);
    const remote = { physical: 1000 + HLC_MAX_DRIFT_MS + 10_000, counter: 0, node: 'devB' };
    const merged = hlcReceive(local, remote, 1000);
    expect(merged.physical).toBeLessThanOrEqual(1000 + HLC_MAX_DRIFT_MS);
  });
});
