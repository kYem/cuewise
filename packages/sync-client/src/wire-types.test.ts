import { describe, expectTypeOf, it } from 'vitest';
import type { AppliedRecord, PushRecord, PushResponse, SyncRecord } from './types';

describe('sync wire types', () => {
  it('a push may carry the seq it last saw, a pulled record never does', () => {
    expectTypeOf<PushRecord>().toHaveProperty('baseSeq');
    expectTypeOf<PushRecord['baseSeq']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<SyncRecord>().not.toHaveProperty('baseSeq');
    expectTypeOf<SyncRecord['seq']>().toEqualTypeOf<number>();
  });

  it('a push response names what landed and hands back the current row for what was refused', () => {
    expectTypeOf<PushResponse['applied']>().toEqualTypeOf<AppliedRecord[]>();
    expectTypeOf<PushResponse['conflicts']>().toEqualTypeOf<SyncRecord[]>();
  });
});
