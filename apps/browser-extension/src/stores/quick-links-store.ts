import {
  deriveQuickLinkTitle,
  generateId,
  logger,
  normalizeQuickLinkUrl,
  QUICK_LINKS_MAX,
  type QuickLink,
} from '@cuewise/shared';
import { getQuickLinks as loadQuickLinks, setQuickLinks as saveQuickLinks } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

const INVALID_URL_MESSAGE = 'Enter a valid website address.';
const SAVE_ERROR_MESSAGE = 'Failed to save quick link. Please try again.';

interface QuickLinksStore {
  quickLinks: QuickLink[];
  isLoading: boolean;
  error: string | null;

  // Actions - return false on error, true on success
  initialize: () => Promise<void>;
  addQuickLink: (title: string, url: string) => Promise<boolean>;
  updateQuickLink: (id: string, updates: { title?: string; url?: string }) => Promise<boolean>;
  removeQuickLink: (id: string) => Promise<boolean>;
}

function reportError(set: (partial: Partial<QuickLinksStore>) => void, message: string): false {
  set({ error: message });
  useToastStore.getState().error(message);
  return false;
}

export const useQuickLinksStore = create<QuickLinksStore>((set, get) => ({
  quickLinks: [],
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });
      const links = await loadQuickLinks();
      set({ quickLinks: links, isLoading: false });
    } catch (error) {
      logger.error('Error initializing quick links store', error);
      set({ error: 'Failed to load quick links. Please refresh the page.', isLoading: false });
      useToastStore.getState().error('Failed to load quick links. Please refresh the page.');
    }
  },

  addQuickLink: async (title: string, url: string) => {
    const normalizedUrl = normalizeQuickLinkUrl(url);
    if (!normalizedUrl) {
      return reportError(set, INVALID_URL_MESSAGE);
    }

    const { quickLinks } = get();
    if (quickLinks.length >= QUICK_LINKS_MAX) {
      return reportError(set, `You can pin up to ${QUICK_LINKS_MAX} quick links.`);
    }

    try {
      const newLink: QuickLink = {
        id: generateId(),
        title: title.trim() || deriveQuickLinkTitle(normalizedUrl),
        url: normalizedUrl,
      };

      const updatedLinks = [...quickLinks, newLink];
      const result = await saveQuickLinks(updatedLinks);
      if (result?.success === false) {
        return reportError(set, SAVE_ERROR_MESSAGE);
      }

      set({ quickLinks: updatedLinks, error: null });
      return true;
    } catch (error) {
      logger.error('Error adding quick link', error);
      return reportError(set, SAVE_ERROR_MESSAGE);
    }
  },

  updateQuickLink: async (id: string, updates: { title?: string; url?: string }) => {
    const { quickLinks } = get();
    const existing = quickLinks.find((link) => link.id === id);
    if (!existing) {
      return false;
    }

    let nextUrl = existing.url;
    if (updates.url !== undefined) {
      const normalizedUrl = normalizeQuickLinkUrl(updates.url);
      if (!normalizedUrl) {
        return reportError(set, INVALID_URL_MESSAGE);
      }
      nextUrl = normalizedUrl;
    }

    const nextTitle =
      updates.title !== undefined
        ? updates.title.trim() || deriveQuickLinkTitle(nextUrl)
        : existing.title;

    try {
      const updatedLinks = quickLinks.map((link) =>
        link.id === id ? { ...link, title: nextTitle, url: nextUrl } : link
      );

      const result = await saveQuickLinks(updatedLinks);
      if (result?.success === false) {
        return reportError(set, SAVE_ERROR_MESSAGE);
      }

      set({ quickLinks: updatedLinks, error: null });
      return true;
    } catch (error) {
      logger.error('Error updating quick link', error);
      return reportError(set, SAVE_ERROR_MESSAGE);
    }
  },

  removeQuickLink: async (id: string) => {
    try {
      const { quickLinks } = get();
      const updatedLinks = quickLinks.filter((link) => link.id !== id);

      const result = await saveQuickLinks(updatedLinks);
      if (result?.success === false) {
        return reportError(set, 'Failed to remove quick link. Please try again.');
      }

      set({ quickLinks: updatedLinks, error: null });
      return true;
    } catch (error) {
      logger.error('Error removing quick link', error);
      return reportError(set, 'Failed to remove quick link. Please try again.');
    }
  },
}));
