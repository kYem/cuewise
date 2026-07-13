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
  it('newer hlc wins', () => {
    expect(s.resolve(body(1000), body(2000)).winner).toBe('incoming');
    expect(s.resolve(body(2000), body(1000)).winner).toBe('local');
  });
  it('equal physical resolves by node tiebreak deterministically', () => {
    const local = { entity: {}, hlc: hlcEncode({ physical: 1000, counter: 0, node: 'z' }) };
    const incoming = { entity: {}, hlc: hlcEncode({ physical: 1000, counter: 0, node: 'a' }) };
    expect(s.resolve(local, incoming).winner).toBe('local'); // 'a' < 'z', local(z) is higher
  });
});
