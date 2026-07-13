import { describe, expect, it } from 'vitest';
import {
  GOLDEN_CODE,
  GOLDEN_MK_B64URL,
  GOLDEN_SECRET,
} from './__fixtures__/golden-recovery-code.fixtures';
import { RecoveryCodeError } from './errors';
import { deriveMasterKey } from './keys';
import { b64urlEncode } from './primitives';
import { generateRecoveryCode, parseRecoveryCode } from './recovery-code';

describe('recovery code', () => {
  it('generates the documented shape: CW1 + six 5-char groups + checksum group', async () => {
    const { code } = await generateRecoveryCode();
    expect(code).toMatch(/^CW1(-[0-9A-HJKMNP-TV-Z]{5}){7}$/);
  });

  it('round-trips: parse(code) returns the canonical secret', async () => {
    const { code, secret } = await generateRecoveryCode();
    await expect(parseRecoveryCode(code)).resolves.toBe(secret);
    expect(secret).toHaveLength(30);
  });

  it('normalizes lowercase, spaces, and Crockford ambiguous chars (O->0, I/L->1)', async () => {
    const { code, secret } = await generateRecoveryCode();
    const messy = code.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'i');
    await expect(parseRecoveryCode(messy)).resolves.toBe(secret);
  });

  it('rejects a single-character typo via the checksum', async () => {
    const { code } = await generateRecoveryCode();
    const body = code.slice(4);
    const flipped = body[0] === 'A' ? 'B' : 'A';
    const typo = `CW1-${flipped}${body.slice(1)}`;
    await expect(parseRecoveryCode(typo)).rejects.toThrow(RecoveryCodeError);
    await expect(parseRecoveryCode(typo)).rejects.toMatchObject({ kind: 'checksum' });
  });

  it('rejects unknown version prefixes', async () => {
    const { code } = await generateRecoveryCode();
    await expect(parseRecoveryCode(`CW2${code.slice(3)}`)).rejects.toMatchObject({
      kind: 'version',
    });
  });

  it('rejects wrong-length input as a format error', async () => {
    await expect(parseRecoveryCode('CW1-ABCDE')).rejects.toMatchObject({ kind: 'format' });
  });

  it('two generated codes differ', async () => {
    const a = await generateRecoveryCode();
    const b = await generateRecoveryCode();
    expect(a.secret).not.toBe(b.secret);
  });

  it('golden fixture: a committed CW1 code parses to the committed secret forever', async () => {
    await expect(parseRecoveryCode(GOLDEN_CODE)).resolves.toBe(GOLDEN_SECRET);
  });

  it('golden fixture: deriveMasterKey(GOLDEN_SECRET) is frozen too (freezes HKDF derivation)', async () => {
    const mk = await deriveMasterKey(GOLDEN_SECRET);
    expect(b64urlEncode(mk)).toBe(GOLDEN_MK_B64URL);
  });
});
