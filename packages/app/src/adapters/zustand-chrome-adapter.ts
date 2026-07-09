/**
 * Chrome Storage adapter for Zustand persist middleware
 * Provides async storage interface compatible with Zustand's persist middleware
 */

import { logger } from '@cuewise/shared';
import type { StateStorage } from 'zustand/middleware';

/**
 * Chrome Local Storage adapter for Zustand
 * Uses chrome.storage.local with async get/set operations
 */
export const chromeLocalStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        // Fallback to localStorage in non-extension context (dev mode)
        return localStorage.getItem(name);
      }

      const result = await chrome.storage.local.get(name);
      const value = result[name];
      return typeof value === 'string' ? value : null;
    } catch (error) {
      logger.error('Error reading from chrome.storage.local', error);
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        // Fallback to localStorage in non-extension context (dev mode)
        localStorage.setItem(name, value);
        return;
      }

      await chrome.storage.local.set({ [name]: value });
    } catch (error) {
      logger.error('Error writing to chrome.storage.local', error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        // Fallback to localStorage in non-extension context (dev mode)
        localStorage.removeItem(name);
        return;
      }

      await chrome.storage.local.remove(name);
    } catch (error) {
      logger.error('Error removing from chrome.storage.local', error);
    }
  },
};
