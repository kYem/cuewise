import { describe, expect, it } from 'vitest';
import { createSerializer } from './serializer';

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSerializer', () => {
  it('starts a call only after the previous one settles', async () => {
    const serialize = createSerializer();
    const gate = deferred();
    const order: string[] = [];

    const first = serialize(async () => {
      await gate.promise;
      order.push('first');
    });
    const second = serialize(async () => {
      order.push('second');
    });
    await Promise.resolve();
    expect(order).toEqual([]);

    gate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
  });

  it('keeps running queued calls after one rejects', async () => {
    const serialize = createSerializer();

    const failed = serialize(() => Promise.reject(new Error('boom')));
    const next = serialize(() => Promise.resolve('ran'));

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ran');
  });

  it('gives each serializer its own queue', async () => {
    const gate = deferred();
    const blocked = createSerializer();
    const free = createSerializer();

    const held = blocked(() => gate.promise);

    await expect(free(() => Promise.resolve('free'))).resolves.toBe('free');
    gate.resolve();
    await held;
  });
});
