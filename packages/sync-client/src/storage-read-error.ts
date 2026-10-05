/** A read the storage adapter could not complete, never to be taken for an absent value. */
export class StorageReadError extends Error {
  constructor(key: string) {
    super(`could not read ${key}`);
    this.name = 'StorageReadError';
  }
}
