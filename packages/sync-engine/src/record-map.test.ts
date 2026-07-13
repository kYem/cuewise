import { DecryptError, EnvelopeParseError, generateDataKey, sealRecord } from '@cuewise/crypto';
import { hlcDecode, hlcEncode, type SyncRecord } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { fromSyncRecord, toPushRecord } from './record-map';
import type { RecordBody } from './strategy';

const HLC = hlcEncode({ physical: 1_700_000_000_000, counter: 3, node: 'device-a' });

function asSyncRecord(pushRecord: Awaited<ReturnType<typeof toPushRecord>>): SyncRecord {
  return { ...pushRecord, seq: 1 };
}

describe('toPushRecord', () => {
  it('seals the body and derives clientUpdatedAt from the hlc physical time', async () => {
    const dk = generateDataKey();
    const body: RecordBody = { entity: { id: 'g1', text: 'x' }, hlc: HLC };

    const pushRecord = await toPushRecord(dk, 'dk-1', 'goals', 'g1', body);

    expect(pushRecord.collection).toBe('goals');
    expect(pushRecord.entityId).toBe('g1');
    expect(pushRecord.deleted).toBe(false);
    expect(pushRecord.clientUpdatedAt).toBe(hlcDecode(HLC).physical);
  });

  it('marks a tombstone body (entity:null) as deleted', async () => {
    const dk = generateDataKey();
    const body: RecordBody = { entity: null, hlc: HLC };

    const pushRecord = await toPushRecord(dk, 'dk-1', 'goals', 'g1', body);

    expect(pushRecord.deleted).toBe(true);
    expect(pushRecord.clientUpdatedAt).toBe(hlcDecode(HLC).physical);
  });
});

describe('fromSyncRecord', () => {
  it('round-trips a live entity body through toPushRecord', async () => {
    const dk = generateDataKey();
    const body: RecordBody = { entity: { id: 'g1', text: 'x' }, hlc: HLC };
    const pushRecord = await toPushRecord(dk, 'dk-1', 'goals', 'g1', body);

    const { body: opened } = await fromSyncRecord(dk, asSyncRecord(pushRecord));

    expect(opened).toEqual(body);
  });

  it('round-trips a tombstone body, preserving its hlc for delete-vs-edit LWW', async () => {
    const dk = generateDataKey();
    const body: RecordBody = { entity: null, hlc: HLC };
    const pushRecord = await toPushRecord(dk, 'dk-1', 'goals', 'g1', body);

    const { body: opened } = await fromSyncRecord(dk, asSyncRecord(pushRecord));

    expect(opened.entity).toBeNull();
    expect(opened.hlc).toBe(HLC);
  });

  it('AAD swap defense: a record sealed for g1 refuses to open as g2', async () => {
    const dk = generateDataKey();
    const body: RecordBody = { entity: { id: 'g1', text: 'x' }, hlc: HLC };
    const pushRecord = await toPushRecord(dk, 'dk-1', 'goals', 'g1', body);
    const forged = asSyncRecord({ ...pushRecord, entityId: 'g2' });

    await expect(fromSyncRecord(dk, forged)).rejects.toThrow(DecryptError);
  });

  it('throws EnvelopeParseError, not SyntaxError, when the decrypted plaintext is not JSON', async () => {
    const dk = generateDataKey();
    const ciphertext = await sealRecord(dk, 'dk-1', 'goals', 'g1', 'not-json{{{');
    const rec: SyncRecord = {
      collection: 'goals',
      entityId: 'g1',
      ciphertext,
      clientUpdatedAt: 0,
      deleted: false,
      seq: 1,
    };

    await expect(fromSyncRecord(dk, rec)).rejects.toThrow(EnvelopeParseError);
  });

  it('throws EnvelopeParseError when the decrypted JSON is missing hlc/entity', async () => {
    const dk = generateDataKey();
    const ciphertext = await sealRecord(dk, 'dk-1', 'goals', 'g1', JSON.stringify({ foo: 'bar' }));
    const rec: SyncRecord = {
      collection: 'goals',
      entityId: 'g1',
      ciphertext,
      clientUpdatedAt: 0,
      deleted: false,
      seq: 1,
    };

    await expect(fromSyncRecord(dk, rec)).rejects.toThrow(EnvelopeParseError);
  });
});
