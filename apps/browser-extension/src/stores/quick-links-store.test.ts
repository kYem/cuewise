import { QUICK_LINKS_MAX, type QuickLink, storageFailure } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickLinksStore } from './quick-links-store';

vi.mock('@cuewise/storage', () => ({
  getQuickLinks: vi.fn(),
  setQuickLinks: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: toastError,
      warning: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

function buildLink(overrides: Partial<QuickLink> = {}): QuickLink {
  return {
    id: 'link-1',
    title: 'GitHub',
    url: 'https://github.com/',
    ...overrides,
  };
}

describe('Quick Links Store', () => {
  beforeEach(() => {
    useQuickLinksStore.setState({ quickLinks: [], isLoading: true, error: null });
    vi.clearAllMocks();
    vi.mocked(storage.setQuickLinks).mockResolvedValue({ success: true });
  });

  describe('initialize', () => {
    it('loads quick links from storage', async () => {
      const links = [buildLink({ id: '1' }), buildLink({ id: '2' })];
      vi.mocked(storage.getQuickLinks).mockResolvedValue(links);

      await useQuickLinksStore.getState().initialize();

      const state = useQuickLinksStore.getState();
      expect(state.quickLinks).toEqual(links);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(null);
    });

    it('sets an error when loading fails', async () => {
      vi.mocked(storage.getQuickLinks).mockRejectedValue(new Error('Storage error'));

      await useQuickLinksStore.getState().initialize();

      const state = useQuickLinksStore.getState();
      expect(state.error).toBeTruthy();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addQuickLink', () => {
    it('normalizes the URL and derives a title when none is given', async () => {
      const ok = await useQuickLinksStore.getState().addQuickLink('', 'github.com');

      expect(ok).toBe(true);
      const [link] = useQuickLinksStore.getState().quickLinks;
      expect(link.url).toBe('https://github.com/');
      expect(link.title).toBe('github.com');
      expect(storage.setQuickLinks).toHaveBeenCalledOnce();
    });

    it('keeps an explicit title', async () => {
      await useQuickLinksStore.getState().addQuickLink('My Repo', 'github.com/kYem');

      const [link] = useQuickLinksStore.getState().quickLinks;
      expect(link.title).toBe('My Repo');
    });

    it('rejects an invalid URL without persisting', async () => {
      const ok = await useQuickLinksStore.getState().addQuickLink('Bad', 'not a url');

      expect(ok).toBe(false);
      expect(useQuickLinksStore.getState().quickLinks).toHaveLength(0);
      expect(storage.setQuickLinks).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalled();
    });

    it('rejects adding beyond the cap', async () => {
      const atCap = Array.from({ length: QUICK_LINKS_MAX }, (_, i) => buildLink({ id: `${i}` }));
      useQuickLinksStore.setState({ quickLinks: atCap });

      const ok = await useQuickLinksStore.getState().addQuickLink('One More', 'example.com');

      expect(ok).toBe(false);
      expect(useQuickLinksStore.getState().quickLinks).toHaveLength(QUICK_LINKS_MAX);
      expect(storage.setQuickLinks).not.toHaveBeenCalled();
    });

    it('honors a failed persist result and does not update state', async () => {
      vi.mocked(storage.setQuickLinks).mockResolvedValue(storageFailure('write failed'));

      const ok = await useQuickLinksStore.getState().addQuickLink('GitHub', 'github.com');

      expect(ok).toBe(false);
      expect(useQuickLinksStore.getState().quickLinks).toHaveLength(0);
      expect(toastError).toHaveBeenCalled();
    });
  });

  describe('updateQuickLink', () => {
    it('updates the title and normalizes a new URL', async () => {
      useQuickLinksStore.setState({ quickLinks: [buildLink({ id: '1' })] });

      const ok = await useQuickLinksStore
        .getState()
        .updateQuickLink('1', { title: 'Renamed', url: 'example.com' });

      expect(ok).toBe(true);
      const [link] = useQuickLinksStore.getState().quickLinks;
      expect(link.title).toBe('Renamed');
      expect(link.url).toBe('https://example.com/');
    });

    it('returns false for an unknown id', async () => {
      const ok = await useQuickLinksStore.getState().updateQuickLink('missing', { title: 'x' });

      expect(ok).toBe(false);
      expect(storage.setQuickLinks).not.toHaveBeenCalled();
    });
  });

  describe('removeQuickLink', () => {
    it('removes the matching link', async () => {
      useQuickLinksStore.setState({
        quickLinks: [buildLink({ id: '1' }), buildLink({ id: '2' })],
      });

      const ok = await useQuickLinksStore.getState().removeQuickLink('1');

      expect(ok).toBe(true);
      const { quickLinks } = useQuickLinksStore.getState();
      expect(quickLinks).toHaveLength(1);
      expect(quickLinks[0].id).toBe('2');
    });
  });
});
