import { logger } from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeRuntimeSyncSink, RELAY_RETRY_DELAYS_MS } from './chrome-runtime-sync-sink';

const ACKED = { ok: true };
const FAILED = { ok: false, reason: 'error' };

const runtime = {
  sendMessage: vi.fn((_message: unknown): Promise<unknown> => Promise.resolve(ACKED)),
};

const totalRetryMs = RELAY_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);

function sentBatches(): unknown[][] {
  return runtime.sendMessage.mock.calls.map(([message]) => (message as { marks: unknown[] }).marks);
}

beforeEach(() => {
  vi.useFakeTimers();
  (chrome as unknown as { runtime: typeof runtime }).runtime = runtime;
  runtime.sendMessage.mockReset();
  runtime.sendMessage.mockResolvedValue(ACKED);
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ChromeRuntimeSyncSink', () => {
  it('relays each kind of mark with its collection and ids', async () => {
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(0);
    sink.markDeleted('goals', 'g1');
    await vi.advanceTimersByTimeAsync(0);
    sink.markMutatedBulk('quotes', ['a', 'b']);
    await vi.advanceTimersByTimeAsync(0);

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-mutation',
      marks: [{ op: 'mutated', collection: 'goals', entityId: 'g1' }],
    });
    expect(sentBatches()).toEqual([
      [{ op: 'mutated', collection: 'goals', entityId: 'g1' }],
      [{ op: 'deleted', collection: 'goals', entityId: 'g1' }],
      [{ op: 'mutatedBulk', collection: 'quotes', entityIds: ['a', 'b'] }],
    ]);
  });

  it('sends marks made while a batch is in flight together in the next batch', async () => {
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    sink.markMutated('goals', 'g2');
    sink.markDeleted('goals', 'g3');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentBatches()).toEqual([
      [{ op: 'mutated', collection: 'goals', entityId: 'g1' }],
      [
        { op: 'mutated', collection: 'goals', entityId: 'g2' },
        { op: 'deleted', collection: 'goals', entityId: 'g3' },
      ],
    ]);
  });

  it.each([
    ['a failed ack', () => runtime.sendMessage.mockResolvedValueOnce(FAILED)],
    ['no listener answering', () => runtime.sendMessage.mockResolvedValueOnce(undefined)],
    [
      'a rejecting sendMessage',
      () => runtime.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.')),
    ],
  ])('retries after %s and stops once the worker acks', async (_case, failOnce) => {
    failOnce();

    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'Sync mutation relay not acknowledged',
      expect.objectContaining({ marks: 1 })
    );
  });

  it('does not retry a batch the worker refused as malformed', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'malformed' });

    new ChromeRuntimeSyncSink().markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last retry, logs an error and moves on to the next batch', async () => {
    runtime.sendMessage.mockResolvedValue(FAILED);
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(0);
    sink.markMutated('goals', 'g2');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(RELAY_RETRY_DELAYS_MS.length + 2);
    expect(sentBatches().at(-1)).toEqual([{ op: 'mutated', collection: 'goals', entityId: 'g2' }]);
    expect(logger.error).toHaveBeenCalledWith('Sync mutation relay gave up', { marks: 1 });
  });

  it('holds a later delete until the earlier edit is acked, so a retry cannot undo it', async () => {
    runtime.sendMessage.mockResolvedValueOnce(FAILED);
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    sink.markDeleted('goals', 'g1');
    await vi.advanceTimersByTimeAsync(totalRetryMs);

    const ops = sentBatches().map((marks) => marks.map((mark) => (mark as { op: string }).op));
    expect(ops).toEqual([['mutated'], ['mutated'], ['deleted']]);
  });

  it('sends a mark made after the queue has drained', async () => {
    const sink = new ChromeRuntimeSyncSink();

    sink.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(0);
    sink.markMutated('goals', 'g2');
    await vi.advanceTimersByTimeAsync(0);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('never throws into the store mutation, even when sendMessage throws synchronously', () => {
    runtime.sendMessage.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });

    expect(() => new ChromeRuntimeSyncSink().markDeleted('goals', 'g1')).not.toThrow();
  });
});
