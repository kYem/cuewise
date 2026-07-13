import { describe, expect, it } from 'vitest';
import { GOLDEN } from './__fixtures__/golden-envelope.fixtures';
import { openRecord, sealRecord } from './envelope';
import { DecryptError, EnvelopeParseError } from './errors';
import { type DataKey, generateDataKey } from './keys';
import { b64urlDecode, b64urlEncode, randomBytes } from './primitives';

const GOAL_JSON = JSON.stringify({
  id: 'g1',
  text: 'Ship E2E sync',
  completed: false,
  date: '2026-07-12',
});

/** Seals GOAL_JSON under a fresh data key as ('goals', 'g1') — the shared happy-path fixture. */
async function sealedGoal(): Promise<{ dk: DataKey; env: string }> {
  const dk = generateDataKey();
  const env = await sealRecord(dk, 'dk-1', 'goals', 'g1', GOAL_JSON);
  return { dk, env };
}

describe('record envelope', () => {
  it('rejects an envelope whose iv is not 12 bytes with EnvelopeParseError', async () => {
    const bad = `v1.dk-1.${b64urlEncode(randomBytes(8))}.${b64urlEncode(randomBytes(24))}`;
    await expect(openRecord(generateDataKey(), bad, 'goals', 'g1')).rejects.toThrow(
      EnvelopeParseError
    );
  });

  it('seal/open round-trips a realistic entity', async () => {
    const { dk, env } = await sealedGoal();
    expect(env).toMatch(/^v1\.dk-1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(openRecord(dk, env, 'goals', 'g1')).resolves.toBe(GOAL_JSON);
  });

  it('swap defense: a goals envelope refuses to open as another collection', async () => {
    const { dk, env } = await sealedGoal();
    await expect(openRecord(dk, env, 'settings', 'g1')).rejects.toThrow(DecryptError);
  });

  it('swap defense: a g1 envelope refuses to open as g2', async () => {
    const { dk, env } = await sealedGoal();
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
    const { env } = await sealedGoal();
    await expect(openRecord(generateDataKey(), env, 'goals', 'g1')).rejects.toThrow(DecryptError);
  });

  it('AAD injection: seal rejects a collection or entityId containing "|"', async () => {
    const dk = generateDataKey();
    await expect(sealRecord(dk, 'dk-1', 'a|b', 'c', GOAL_JSON)).rejects.toThrow(EnvelopeParseError);
    await expect(sealRecord(dk, 'dk-1', 'a', 'b|c', GOAL_JSON)).rejects.toThrow(EnvelopeParseError);
  });

  it('AAD injection: seal rejects an empty collection or entityId', async () => {
    const dk = generateDataKey();
    await expect(sealRecord(dk, 'dk-1', '', 'g1', GOAL_JSON)).rejects.toThrow(EnvelopeParseError);
    await expect(sealRecord(dk, 'dk-1', 'goals', '', GOAL_JSON)).rejects.toThrow(
      EnvelopeParseError
    );
  });

  it('AAD injection: open rejects the same cross-shapes, closing the (a|b,c) vs (a,b|c) swap window', async () => {
    const { dk, env } = await sealedGoal();
    await expect(openRecord(dk, env, 'a|b', 'c')).rejects.toThrow(EnvelopeParseError);
    await expect(openRecord(dk, env, 'a', 'b|c')).rejects.toThrow(EnvelopeParseError);
  });

  it('normal ids without "|" still round-trip after the AAD-component guard', async () => {
    const dk = generateDataKey();
    const env = await sealRecord(dk, 'dk-2', 'quotes', 'q-42', GOAL_JSON);
    await expect(openRecord(dk, env, 'quotes', 'q-42')).resolves.toBe(GOAL_JSON);
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
    // Golden bytes come from a fixture, not a producer function, so the brand is asserted here.
    const dk = b64urlDecode(GOLDEN.dataKeyB64url) as DataKey;
    await expect(openRecord(dk, GOLDEN.envelope, GOLDEN.collection, GOLDEN.entityId)).resolves.toBe(
      GOLDEN.plaintext
    );
  });
});
