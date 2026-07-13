import { logger } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeRuntimeSyncSink } from './chrome-runtime-sync-sink';

const runtime = {
  sendMessage: vi.fn((_message: unknown) => Promise.resolve()),
};

beforeEach(() => {
  (chrome as unknown as { runtime: typeof runtime }).runtime = runtime;
  runtime.sendMessage.mockClear();
});

describe('ChromeRuntimeSyncSink', () => {
  it('posts a mutated message with the collection and entity id', () => {
    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-mutation',
      op: 'mutated',
      collection: 'goals',
      entityId: 'g1',
    });
  });

  it('posts a deleted message with the collection and entity id', () => {
    new ChromeRuntimeSyncSink().markDeleted('goals', 'g1');

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-mutation',
      op: 'deleted',
      collection: 'goals',
      entityId: 'g1',
    });
  });

  it('posts a mutatedBulk message with the collection and entity ids', () => {
    new ChromeRuntimeSyncSink().markMutatedBulk('quotes', ['a', 'b']);

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-mutation',
      op: 'mutatedBulk',
      collection: 'quotes',
      entityIds: ['a', 'b'],
    });
  });

  it('swallows a rejecting sendMessage (no receiver / service worker asleep) and logs a warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    runtime.sendMessage.mockReturnValueOnce(Promise.reject(new Error('no receiver')));

    expect(() => new ChromeRuntimeSyncSink().markMutated('goals', 'g1')).not.toThrow();
    // Flush the microtask queue so the rejection handler runs before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      'Sync mutation relay failed',
      expect.objectContaining({ op: 'mutated', collection: 'goals' })
    );
    warnSpy.mockRestore();
  });

  it('swallows a synchronous throw from sendMessage and logs a warning', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    runtime.sendMessage.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(() => new ChromeRuntimeSyncSink().markDeleted('goals', 'g1')).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      'Sync mutation relay failed',
      expect.objectContaining({ op: 'deleted', collection: 'goals' })
    );
    warnSpy.mockRestore();
  });
});
