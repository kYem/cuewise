import { logger } from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeRuntimeSyncSink, RELAY_RETRY_DELAYS_MS } from './chrome-runtime-sync-sink';

const ACKED = { ok: true };
const FAILED = { ok: false, reason: 'error' };

const runtime = {
  sendMessage: vi.fn((_message: unknown): Promise<unknown> => Promise.resolve(ACKED)),
};

const totalRetryMs = RELAY_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);

beforeEach(() => {
  vi.useFakeTimers();
  (chrome as unknown as { runtime: typeof runtime }).runtime = runtime;
  runtime.sendMessage.mockReset();
  runtime.sendMessage.mockResolvedValue(ACKED);
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it('retries a failed ack and stops once the worker acks', async () => {
    runtime.sendMessage.mockResolvedValueOnce(FAILED);

    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('retries when no listener answers', async () => {
    runtime.sendMessage.mockResolvedValueOnce(undefined);

    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('retries a rejecting sendMessage (worker still starting) and logs a warning', async () => {
    runtime.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));

    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'Sync mutation relay failed',
      expect.objectContaining({ op: 'mutated', collection: 'goals' })
    );
  });

  it('does not retry a mark the worker refused as malformed', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'malformed' });

    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last retry and moves on to the next mark', async () => {
    runtime.sendMessage.mockResolvedValue(FAILED);
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    sink.markMutated('goals', 'g2');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(RELAY_RETRY_DELAYS_MS.length + 2);
    expect(runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityId: 'g2' })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Sync mutation relay gave up',
      expect.objectContaining({ op: 'mutated', collection: 'goals' })
    );
  });

  it('holds a later delete until the earlier edit is acked, so a retry cannot undo it', async () => {
    runtime.sendMessage.mockResolvedValueOnce(FAILED);
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    sink.markDeleted('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    const ops = runtime.sendMessage.mock.calls.map(([message]) => (message as { op: string }).op);
    expect(ops).toEqual(['mutated', 'mutated', 'deleted']);
  });

  it('never throws into the store mutation, even when sendMessage throws synchronously', () => {
    runtime.sendMessage.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });

    expect(() => new ChromeRuntimeSyncSink().markDeleted('goals', 'g1')).not.toThrow();
  });
});
