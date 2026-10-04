import { logger } from '@cuewise/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSyncMessage, type SyncMessageEngine } from './handle-sync-message';

function fakeEngine(): SyncMessageEngine {
  return {
    markMutated: vi.fn(),
    markDeleted: vi.fn(),
    markMutatedBulk: vi.fn(),
  };
}

const MUTATED_GOAL = {
  kind: 'cuewise-sync-mutation',
  op: 'mutated',
  collection: 'goals',
  entityId: 'g1',
};

describe('handleSyncMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes a mutated message to markMutated with the collection and entity id', () => {
    const engine = fakeEngine();

    handleSyncMessage(engine, MUTATED_GOAL);

    expect(engine.markMutated).toHaveBeenCalledWith('goals', 'g1');
    expect(engine.markDeleted).not.toHaveBeenCalled();
    expect(engine.markMutatedBulk).not.toHaveBeenCalled();
  });

  it('routes a deleted message to markDeleted with the collection and entity id', () => {
    const engine = fakeEngine();

    handleSyncMessage(engine, {
      kind: 'cuewise-sync-mutation',
      op: 'deleted',
      collection: 'goals',
      entityId: 'g1',
    });

    expect(engine.markDeleted).toHaveBeenCalledWith('goals', 'g1');
    expect(engine.markMutated).not.toHaveBeenCalled();
  });

  it('routes a mutatedBulk message to markMutatedBulk with the collection and entity ids', () => {
    const engine = fakeEngine();

    handleSyncMessage(engine, {
      kind: 'cuewise-sync-mutation',
      op: 'mutatedBulk',
      collection: 'quotes',
      entityIds: ['a', 'b'],
    });

    expect(engine.markMutatedBulk).toHaveBeenCalledWith('quotes', ['a', 'b']);
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

    const ack = handleSyncMessage(engine, MUTATED_GOAL)?.then((reply) => {
      acked = true;
      return reply;
    });
    await Promise.resolve();
    expect(acked).toBe(false);

    finishWrite();
    await expect(ack).resolves.toEqual({ ok: true });
  });

  it('acks an error when the ledger write rejects', async () => {
    const engine = fakeEngine();
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.mocked(engine.markDeleted).mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    const ack = handleSyncMessage(engine, { ...MUTATED_GOAL, op: 'deleted' });

    await expect(ack).resolves.toEqual({ ok: false, reason: 'error' });
  });

  it('acks malformed for a sync-mutation message it cannot route', async () => {
    const engine = fakeEngine();
    vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const ack = handleSyncMessage(engine, { kind: 'cuewise-sync-mutation', op: 'mutated' });

    await expect(ack).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('silently ignores a message with a different kind (e.g. sync-control) and never calls the engine', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    expect(
      handleSyncMessage(engine, { kind: 'cuewise-sync-control', op: 'enable' })
    ).toBeUndefined();

    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(engine.markDeleted).not.toHaveBeenCalled();
    expect(engine.markMutatedBulk).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns on a genuinely malformed sync-mutation message (unrecognised op)', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    handleSyncMessage(engine, {
      kind: 'cuewise-sync-mutation',
      op: 'not-a-real-op',
      collection: 'goals',
    });

    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(engine.markDeleted).not.toHaveBeenCalled();
    expect(engine.markMutatedBulk).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores a message missing collection and never calls the engine', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    handleSyncMessage(engine, { kind: 'cuewise-sync-mutation', op: 'mutated', entityId: 'g1' });

    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores a mutated message missing entityId and never calls the engine', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    handleSyncMessage(engine, {
      kind: 'cuewise-sync-mutation',
      op: 'mutated',
      collection: 'goals',
    });

    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores a mutatedBulk message missing entityIds and never calls the engine', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    handleSyncMessage(engine, {
      kind: 'cuewise-sync-mutation',
      op: 'mutatedBulk',
      collection: 'quotes',
    });

    expect(engine.markMutatedBulk).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('silently ignores a non-object message (e.g. null or a primitive) and never calls the engine', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    handleSyncMessage(engine, null);
    handleSyncMessage(engine, 'not-a-message');

    expect(engine.markMutated).not.toHaveBeenCalled();
    expect(engine.markDeleted).not.toHaveBeenCalled();
    expect(engine.markMutatedBulk).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
