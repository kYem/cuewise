import { describe, expect, it } from 'vitest';
import { GOLDEN } from './__fixtures__/golden-envelope.fixtures';
import { openRecord, sealRecord } from './envelope';
import { DecryptError, EnvelopeParseError } from './errors';
import { generateDataKey } from './keys';
import { b64urlDecode } from './primitives';

const GOAL_JSON = JSON.stringify({
  id: 'g1',
  text: 'Ship E2E sync',
  completed: false,
  date: '2026-07-12',
});

describe('record envelope', () => {
  it('seal/open round-trips a realistic entity', async () => {
    const dk = generateDataKey();
    const env = await sealRecord(dk, 'dk-1', 'goals', 'g1', GOAL_JSON);
    expect(env).toMatch(/^v1\.dk-1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(openRecord(dk, env, 'goals', 'g1')).resolves.toBe(GOAL_JSON);
  });

  it('swap defense: a goals envelope refuses to open as another collection', async () => {
    const dk = generateDataKey();
    const env = await sealRecord(dk, 'dk-1', 'goals', 'g1', GOAL_JSON);
    await expect(openRecord(dk, env, 'settings', 'g1')).rejects.toThrow(DecryptError);
  });

  it('swap defense: a g1 envelope refuses to open as g2', async () => {
    const dk = generateDataKey();
    const env = await sealRecord(dk, 'dk-1', 'goals', 'g1', GOAL_JSON);
    await expect(openRecord(dk, env, 'goals', 'g2')).rejects.toThrow(DecryptError);
  });

  it('AAD binding is enforced at open, not incidental: an envelope hand-built with empty AAD fails', async () => {
    // Proves openRecord supplies a non-empty AAD — the permanent form of the mutation check.
    const { aesGcmSeal, b64urlEncode, randomBytes, utf8 } = await import('./primitives');
    const dk = generateDataKey();
    const iv = randomBytes(12);
    const ct = await aesGcmSeal(dk, iv, utf8(GOAL_JSON), utf8(''));
    const forged = `v1.dk-1.${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
    await expect(openRecord(dk, forged, 'goals', 'g1')).rejects.toThrow(DecryptError);
  });

  it('wrong data key throws DecryptError', async () => {
    const env = await sealRecord(generateDataKey(), 'dk-1', 'goals', 'g1', GOAL_JSON);
    await expect(openRecord(generateDataKey(), env, 'goals', 'g1')).rejects.toThrow(DecryptError);
  });

  it.each([
    '',
    'v1.dk-1.abc',
    'v1.dk-1.a.b.c',
    'v2.dk-1.aaaa.bbbb',
    'v1.rogue.aaaa.bbbb',
    'v1.dk-1.!!!.bbbb',
    'v1.dk-1.aaaa.???',
  ])('malformed envelope %j throws EnvelopeParseError', async (bad) => {
    await expect(openRecord(generateDataKey(), bad, 'goals', 'g1')).rejects.toThrow(
      EnvelopeParseError
    );
  });

  it('golden fixture: a committed v1 envelope decrypts forever', async () => {
    const dk = b64urlDecode(GOLDEN.dataKeyB64url);
    await expect(openRecord(dk, GOLDEN.envelope, GOLDEN.collection, GOLDEN.entityId)).resolves.toBe(
      GOLDEN.plaintext
    );
  });
});
