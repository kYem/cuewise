// The spec's end-to-end guarantee as one executable test: device A enables sync and
// pushes; device B enrolls with only the recovery code and reads identical data.
import { describe, expect, it } from 'vitest';
import { openRecord, sealRecord } from './envelope';
import { deriveMasterKey, generateDataKey, unwrapDataKey, wrapDataKey } from './keys';
import { generateRecoveryCode, parseRecoveryCode } from './recovery-code';

const ENTITIES = [
  {
    collection: 'goals',
    entityId: 'g1',
    json: JSON.stringify({ id: 'g1', text: 'Run 5k', completed: false, date: '2026-07-12' }),
  },
  {
    collection: 'quotes',
    entityId: 'q1',
    json: JSON.stringify({ id: 'q1', text: 'Stay hungry', author: 'Jobs', category: 'motivation' }),
  },
  {
    collection: 'settings',
    entityId: 'singleton',
    json: JSON.stringify({ theme: 'glass', density: 'compact' }),
  },
];

describe('golden path: enable on A, enroll on B via recovery code', () => {
  it('B decrypts byte-identical entities knowing only the code and server-held blobs', async () => {
    // Device A: enable sync.
    const { code, secret } = await generateRecoveryCode();
    const mkA = await deriveMasterKey(secret);
    const dk = generateDataKey();
    const serverKeyBlob = await wrapDataKey(mkA, dk, 'dk-1');
    const serverRecords = await Promise.all(
      ENTITIES.map(async (e) => ({
        collection: e.collection,
        entityId: e.entityId,
        ciphertext: await sealRecord(dk, 'dk-1', e.collection, e.entityId, e.json),
      }))
    );

    // Device B: knows ONLY the typed code + what the server stores.
    const mkB = await deriveMasterKey(await parseRecoveryCode(code));
    const { dk: dkB, keyId } = await unwrapDataKey(mkB, serverKeyBlob);
    expect(keyId).toBe('dk-1');
    for (const [i, rec] of serverRecords.entries()) {
      const opened = await openRecord(dkB, rec.ciphertext, rec.collection, rec.entityId);
      expect(opened).toBe(ENTITIES[i].json);
    }
  });
});
