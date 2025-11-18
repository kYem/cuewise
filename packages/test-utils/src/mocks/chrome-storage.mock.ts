import { vi } from 'vitest';

export interface MockChromeStorage {
  data: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

export function createChromeStorageMock(): MockChromeStorage {
  const data: Record<string, unknown> = {};

  return {
    data,
    get: vi.fn((keys: string | string[] | null) => {
      if (keys === null) {
        return Promise.resolve(data);
      }
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: data[keys] });
      }
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in data) {
          result[key] = data[key];
        }
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keysArray = typeof keys === 'string' ? [keys] : keys;
      for (const key of keysArray) {
        delete data[key];
      }
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
      return Promise.resolve();
    }),
  };
}
