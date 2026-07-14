import { logger } from '@cuewise/shared';
import { describe, expect, it, vi } from 'vitest';
import { handleSyncMessage, type SyncMessageEngine } from './handle-sync-message';

function fakeEngine(): SyncMessageEngine {
  return {
    markMutated: vi.fn(),
    markDeleted: vi.fn(),
    markMutatedBulk: vi.fn(),
  };
}

describe('handleSyncMessage', () => {
  it('routes a mutated message to markMutated with the collection and entity id', () => {
    const engine = fakeEngine();

    handleSyncMessage(engine, {
      kind: 'cuewise-sync-mutation',
      op: 'mutated',
      collection: 'goals',
      entityId: 'g1',
    });

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

  it('silently ignores a message with a different kind (e.g. sync-control) and never calls the engine', () => {
    const engine = fakeEngine();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    handleSyncMessage(engine, { kind: 'cuewise-sync-control', op: 'enable' });

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
