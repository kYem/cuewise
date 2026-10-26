/**
 * Promise-chain mutex: each call runs only after every earlier one settles, so a rejection never
 * jams the queue. Each serializer is its own queue.
 */
export function createSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let mutex: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = mutex.then(fn, fn);
    mutex = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
