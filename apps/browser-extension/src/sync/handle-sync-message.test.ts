import { logger } from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSyncMessage, type SyncMessageEngine } from './handle-sync-message';

function fakeEngine(): SyncMessageEngine {
  return {
    markMutated: vi.fn(),
    markDeleted: vi.fn(),
    markMutatedBulk: vi.fn(),
  };
}

function batch(...marks: unknown[]) {
  return { kind: 'cuewise-sync-mutation', marks };
}

const MUTATED_GOAL = { op: 'mutated', collection: 'goals', entityId: 'g1' };
const DELETED_GOAL = { op: 'deleted', collection: 'goals', entityId: 'g1' };
const MUTATED_QUOTES = { op: 'mutatedBulk', collection: 'quotes', entityIds: ['a', 'b'] };

describe('handleSyncMessage', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes each mark to the matching engine call, in order', async () => {
    const engine = fakeEngine();
    const calls: string[] = [];
    vi.mocked(engine.markMutated).mockImplementation(() => {
      calls.push('mutated');
    });
    vi.mocked(engine.markDeleted).mockImplementation(() => {
      calls.push('deleted');
    });
    vi.mocked(engine.markMutatedBulk).mockImplementation(() => {
      calls.push('mutatedBulk');
    });

    await handleSyncMessage(engine, batch(MUTATED_GOAL, MUTATED_QUOTES, DELETED_GOAL));

    expect(calls).toEqual(['mutated', 'mutatedBulk', 'deleted']);
    expect(engine.markMutated).toHaveBeenCalledWith('goals', 'g1');
    expect(engine.markMutatedBulk).toHaveBeenCalledWith('quotes', ['a', 'b']);
    expect(engine.markDeleted).toHaveBeenCalledWith('goals', 'g1');
  });

  it('acks ok only once the ledger write resolves', async () => {
    const engine = fakeEngine();
    let finishWrite = () => {};
    vi.mocked(engine.markMutated).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      })
    );
    let acked = false;

    const ack = handleSyncMessage(engine, batch(MUTATED_GOAL))?.then((reply) => {
      acked = true;
      return reply;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(acked).toBe(false);

    finishWrite();
    await expect(ack).resolves.toEqual({ ok: true });
  });

  it('acks an error and stops at the first ledger write that rejects', async () => {
    const engine = fakeEngine();
    vi.mocked(engine.markMutated).mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    const ack = handleSyncMessage(engine, batch(MUTATED_GOAL, DELETED_GOAL));

    await expect(ack).resolves.toEqual({ ok: false, reason: 'error' });
    expect(engine.markDeleted).not.toHaveBeenCalled();
  });

  it('acks malformed for a mutation message without a marks list', async () => {
    await expect(
      handleSyncMessage(fakeEngine(), { kind: 'cuewise-sync-mutation', op: 'mutated' })
    ).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    { op: 'not-a-real-op', collection: 'goals' },
    { op: 'mutated', entityId: 'g1' },
    { op: 'mutated', collection: 'goals' },
    { op: 'mutatedBulk', collection: 'quotes' },
    null,
  ])('skips and warns on a malformed mark (%o) but records the rest', async (mark) => {
    const engine = fakeEngine();

    const ack = handleSyncMessage(engine, batch(mark, DELETED_GOAL));

    await expect(ack).resolves.toEqual({ ok: true });
    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(engine.markMutatedBulk).not.toHaveBeenCalled();
    expect(engine.markDeleted).toHaveBeenCalledWith('goals', 'g1');
    expect(logger.warn).toHaveBeenCalled();
  });

  it.each([
    { kind: 'cuewise-sync-control', op: 'enable' },
    null,
    'not-a-message',
  ])('leaves another channel’s message (%o) to its own listener', (msg) => {
    const engine = fakeEngine();

    expect(handleSyncMessage(engine, msg)).toBeUndefined();
    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
