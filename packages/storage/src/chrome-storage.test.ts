import type { MockChromeStorage } from '@cuewise/test-utils/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeFromStorage } from './chrome-storage';

describe('chrome-storage remove', () => {
  describe('with chrome.storage available', () => {
    it('removeFromStorage removes the key via chrome.storage', async () => {
      const local = global.chrome.storage.local as unknown as MockChromeStorage;
      local.data.greeting = 'hi';

      const result = await removeFromStorage('greeting');

      expect(result).toBe(true);
      expect(local.remove).toHaveBeenCalledWith('greeting');
      expect(local.data.greeting).toBeUndefined();
    });
  });

  // Regression: in a plain web page (dev) `chrome` is undefined. These must fall
  // back to localStorage instead of throwing (which broke quote migration on load).
  describe('in development without chrome.storage', () => {
    let removeItemSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.stubGlobal('chrome', undefined);
      removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      removeItemSpy.mockRestore();
    });

    it('removeFromStorage falls back to localStorage and does not throw', async () => {
      const result = await removeFromStorage('legacyQuotes');

      expect(result).toBe(true);
      expect(removeItemSpy).toHaveBeenCalledWith('legacyQuotes');
    });
  });
});
