/**
 * A LockManager good enough for exclusive holds (`withLock`) and `ifAvailable` (leader election).
 * jsdom ships none, so without this the Chrome adapter's locking cannot be exercised anywhere.
 */
export function createLockManagerMock(): LockManager {
  const chains = new Map<string, Promise<unknown>>();
  // Held or queued, which is what `ifAvailable` refuses on.
  const claims = new Map<string, number>();

  type Callback = (lock: unknown) => Promise<unknown>;
  const request = (
    name: string,
    optionsOrCallback: LockOptions | Callback,
    maybeCallback?: Callback
  ) => {
    let callback = maybeCallback;
    let options: LockOptions = {};
    if (typeof optionsOrCallback === 'function') {
      callback = optionsOrCallback;
    } else {
      options = optionsOrCallback;
    }
    if (callback === undefined) {
      return Promise.reject(new TypeError('a lock request needs a callback'));
    }
    const run = callback;
    if (options.ifAvailable === true && (claims.get(name) ?? 0) > 0) {
      return Promise.resolve().then(() => run(null));
    }

    claims.set(name, (claims.get(name) ?? 0) + 1);
    const previous = chains.get(name) ?? Promise.resolve();
    const next = previous
      .then(
        () => run({ name, mode: 'exclusive' }),
        () => run({ name, mode: 'exclusive' })
      )
      .finally(() => {
        claims.set(name, (claims.get(name) ?? 1) - 1);
      });
    chains.set(
      name,
      next.catch(() => undefined)
    );
    return next;
  };

  return {
    request,
    query: () => Promise.resolve({ held: [], pending: [] }),
  } as unknown as LockManager;
}

/** Returns a teardown that restores whatever `navigator.locks` was before. */
export function installLockManagerMock(): () => void {
  const target: { locks?: LockManager } = navigator;
  const had = 'locks' in target;
  const previous = target.locks;
  Object.defineProperty(target, 'locks', {
    value: createLockManagerMock(),
    configurable: true,
    writable: true,
  });
  return () => {
    if (had) {
      Object.defineProperty(target, 'locks', {
        value: previous,
        configurable: true,
        writable: true,
      });
      return;
    }
    delete target.locks;
  };
}
