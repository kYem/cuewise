import { hlcEncode } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { LwwHlcStrategy } from './strategy';

const body = (physical: number, node = 'a') => ({
  entity: { id: 'g1', v: physical },
  hlc: hlcEncode({ physical, counter: 0, node }),
});

describe('LwwHlcStrategy', () => {
  const s = new LwwHlcStrategy();
  it('incoming wins when no local exists', () => {
    expect(s.resolve(null, body(1000))).toEqual({ winner: 'incoming', body: body(1000) });
  });
  it('a newer incoming hlc wins', () => {
    expect(s.resolve(body(1000), body(2000))).toEqual({ winner: 'incoming', body: body(2000) });
  });
  it('a strictly newer local is kept and named as newer, so the caller can repair the server', () => {
    expect(s.resolve(body(2000), body(1000))).toEqual({ winner: 'local', reason: 'newer' });
  });
  it('an identical hlc is kept and named as same, so an echo of our own push never repairs', () => {
    expect(s.resolve(body(1000), body(1000))).toEqual({ winner: 'local', reason: 'same' });
  });
  it('equal physical time resolves by counter before node', () => {
    const local = { entity: {}, hlc: hlcEncode({ physical: 1000, counter: 2, node: 'a' }) };
    const incoming = { entity: {}, hlc: hlcEncode({ physical: 1000, counter: 1, node: 'z' }) };
    expect(s.resolve(local, incoming)).toEqual({ winner: 'local', reason: 'newer' });
  });
  it('equal physical and counter resolves by node tiebreak deterministically', () => {
    const local = { entity: {}, hlc: hlcEncode({ physical: 1000, counter: 0, node: 'z' }) };
    const incoming = { entity: {}, hlc: hlcEncode({ physical: 1000, counter: 0, node: 'a' }) };
    expect(s.resolve(local, incoming)).toEqual({ winner: 'local', reason: 'newer' }); // 'a' < 'z'
  });
});
