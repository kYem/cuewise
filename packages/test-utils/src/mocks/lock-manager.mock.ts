/**
 * A LockManager good enough for the exclusive-hold contract `withLock` relies on. jsdom ships none,
 * so without this the Chrome adapter's locking cannot be exercised anywhere.
 */
export function createLockManagerMock(): LockManager {
  const chains = new Map<string, Promise<unknown>>();

  const request = (name: string, callback: (lock: unknown) => Promise<unknown>) => {
    const previous = chains.get(name) ?? Promise.resolve();
    const next = previous.then(
      () => callback({ name, mode: 'exclusive' }),
      () => callback({ name, mode: 'exclusive' })
    );
    chains.set(name, next);
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
