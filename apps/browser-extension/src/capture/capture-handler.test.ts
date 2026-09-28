import {
  type ConceptCard,
  configurePlatform,
  type Quote,
  type StorageResult,
  type SyncMutationSink,
} from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDraft,
  buildMenuClick,
  buildSourceTab,
  type CaptureChromeMock,
  DOM_SELECTION,
  FLATTENED_SELECTION,
  installCaptureChromeMock,
  PAGE,
  seedDraft,
  storedDraft,
} from './__fixtures__/capture.fixtures';
import {
  CAPTURE_MENU_IDS,
  handleCaptureMenuClick,
  registerCaptureMenus,
  saveCapture,
} from './capture-handler';

const { writes } = vi.hoisted(() => ({
  writes: {
    conceptCards: vi.fn<(cards: ConceptCard[]) => Promise<StorageResult>>(),
    quotes: vi.fn<(quotes: Quote[]) => Promise<StorageResult>>(),
  },
}));

vi.mock('@cuewise/storage', () => ({
  getConceptCards: vi.fn(async () => []),
  getQuotes: vi.fn(async () => []),
  // Faithful: the append must be computed from the read made inside the locked helper.
  updateConceptCards: vi.fn(async (mutate: (cards: ConceptCard[]) => ConceptCard[]) => {
    const cards = mutate(await storage.getConceptCards());
    return { result: await writes.conceptCards(cards), cards };
  }),
  updateQuotes: vi.fn(async (mutate: (quotes: Quote[]) => Quote[]) => {
    const quotes = mutate(await storage.getQuotes());
    return { result: await writes.quotes(quotes), quotes };
  }),
}));

let chromeMock: CaptureChromeMock;
let syncSink: { markMutated: ReturnType<typeof vi.fn>; markDeleted: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  chromeMock = installCaptureChromeMock();
  writes.conceptCards.mockResolvedValue({ success: true });
  writes.quotes.mockResolvedValue({ success: true });
  syncSink = { markMutated: vi.fn(), markDeleted: vi.fn() };
  configurePlatform({ syncSink: syncSink as SyncMutationSink });
  return () => {
    configurePlatform({ syncSink: null });
  };
});

describe('registerCaptureMenus', () => {
  it('nests both save items under one Cuewise parent shown on a selection', async () => {
    await registerCaptureMenus();

    const items = chromeMock.contextMenus.create.mock.calls.map(([item]) => item);
    expect(items).toEqual([
      { id: CAPTURE_MENU_IDS.parent, title: 'Cuewise', contexts: ['selection'] },
      expect.objectContaining({ id: CAPTURE_MENU_IDS.concept, parentId: CAPTURE_MENU_IDS.parent }),
      expect.objectContaining({ id: CAPTURE_MENU_IDS.quote, parentId: CAPTURE_MENU_IDS.parent }),
    ]);
  });

  it('clears the old items first, so an update does not create duplicates', async () => {
    await registerCaptureMenus();

    expect(chromeMock.contextMenus.removeAll.mock.invocationCallOrder[0]).toBeLessThan(
      chromeMock.contextMenus.create.mock.invocationCallOrder[0]
    );
  });
});

describe('handleCaptureMenuClick', () => {
  it('drafts the DOM selection, keeping its line breaks', async () => {
    await handleCaptureMenuClick(buildMenuClick(), buildSourceTab());

    expect(storedDraft(chromeMock)).toEqual(buildDraft({ text: DOM_SELECTION }));
  });

  it('reads the selection from the frame that was clicked', async () => {
    await handleCaptureMenuClick(buildMenuClick({ frameId: 3 }), buildSourceTab());

    expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: PAGE.tabId, frameIds: [3] } })
    );
  });

  it('falls back to the flattened selection text when the page cannot be scripted', async () => {
    chromeMock.scripting.executeScript.mockRejectedValue(
      new Error('Cannot access contents of the page')
    );

    await handleCaptureMenuClick(buildMenuClick(), buildSourceTab());

    expect(storedDraft(chromeMock)).toMatchObject({ text: FLATTENED_SELECTION });
  });

  it('falls back to the selection text when the DOM selection is empty, as in a form field', async () => {
    chromeMock.scripting.executeScript.mockResolvedValue([{ frameId: 0, result: '' }]);

    await handleCaptureMenuClick(buildMenuClick(), buildSourceTab());

    expect(storedDraft(chromeMock)).toMatchObject({ text: FLATTENED_SELECTION });
  });

  it('drafts a quote from the quote item', async () => {
    await handleCaptureMenuClick(
      buildMenuClick({ menuItemId: CAPTURE_MENU_IDS.quote }),
      buildSourceTab()
    );

    expect(storedDraft(chromeMock)).toMatchObject({ kind: 'quote' });
  });

  it('opens the toolbar popup on the draft', async () => {
    await handleCaptureMenuClick(buildMenuClick(), buildSourceTab());

    expect(chromeMock.action.openPopup).toHaveBeenCalled();
    expect(chromeMock.windows.create).not.toHaveBeenCalled();
  });

  it('opens a popup window instead when Chrome refuses the toolbar popup', async () => {
    chromeMock.action.openPopup.mockRejectedValue(new Error('no active browser window'));

    await handleCaptureMenuClick(buildMenuClick(), buildSourceTab());

    expect(chromeMock.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popup', url: 'chrome-extension://cuewise/popup.html' })
    );
  });

  it('ignores a menu item that is not a capture', async () => {
    await handleCaptureMenuClick(
      buildMenuClick({ menuItemId: 'something-else' }),
      buildSourceTab()
    );

    expect(storedDraft(chromeMock)).toBeUndefined();
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();
  });
});

describe('saveCapture', () => {
  it('appends a concept linked to its page through the locked helper', async () => {
    const response = await saveCapture(buildDraft());

    expect(response).toEqual({ ok: true });
    expect(storage.updateConceptCards).toHaveBeenCalledTimes(1);
    expect(writes.conceptCards).toHaveBeenCalledWith([
      expect.objectContaining({
        term: 'Saga pattern',
        definition: 'A sequence of local transactions.',
        source: PAGE.title,
        sourceUrl: PAGE.url,
      }),
    ]);
  });

  it('saves the fields the popup edited over what the selection suggested', async () => {
    await saveCapture(buildDraft({ term: 'Sagas', definition: 'Compensating steps.' }));

    expect(writes.conceptCards).toHaveBeenCalledWith([
      expect.objectContaining({ term: 'Sagas', definition: 'Compensating steps.' }),
    ]);
  });

  it('does not mark a concept for sync, which does not carry concepts', async () => {
    await saveCapture(buildDraft());

    expect(syncSink.markMutated).not.toHaveBeenCalled();
  });

  it('appends a quote through the locked helper and marks it for sync', async () => {
    const response = await saveCapture(
      buildDraft({ kind: 'quote', text: 'Be yourself.\n— Oscar Wilde' })
    );

    expect(response).toEqual({ ok: true });
    const [[quotes]] = writes.quotes.mock.calls;
    expect(quotes).toEqual([
      expect.objectContaining({
        text: 'Be yourself.',
        author: 'Oscar Wilde',
        category: 'inspiration',
        isCustom: true,
        sourceUrl: PAGE.url,
      }),
    ]);
    expect(syncSink.markMutated).toHaveBeenCalledWith('quotes', quotes[0].id);
  });

  it('saves a quote with no author as Unknown', async () => {
    await saveCapture(buildDraft({ kind: 'quote', text: 'Be yourself.', author: ' ' }));

    expect(writes.quotes).toHaveBeenCalledWith([expect.objectContaining({ author: 'Unknown' })]);
  });

  it('keeps no link to a page that is not http(s)', async () => {
    await saveCapture(buildDraft({ pageUrl: 'file:///Users/me/notes.html', pageTitle: undefined }));

    expect(writes.conceptCards).toHaveBeenCalledWith([
      expect.objectContaining({ sourceUrl: undefined, source: undefined }),
    ]);
  });

  it.each([
    ['a concept with no term', buildDraft({ term: '' })],
    ['a concept with no definition', buildDraft({ term: 'Saga', definition: '  ' })],
    ['a quote with no text', buildDraft({ kind: 'quote', quoteText: '' })],
  ])('refuses %s without writing', async (_, draft) => {
    const response = await saveCapture(draft);

    expect(response.ok).toBe(false);
    expect(writes.conceptCards).not.toHaveBeenCalled();
    expect(writes.quotes).not.toHaveBeenCalled();
  });

  it('refuses a malformed draft', async () => {
    const response = await saveCapture({ kind: 'goal', text: 'x' });

    expect(response.ok).toBe(false);
    expect(storage.updateConceptCards).not.toHaveBeenCalled();
  });

  it('clears the draft once the item is saved', async () => {
    seedDraft(chromeMock, buildDraft());

    await saveCapture(buildDraft());

    expect(storedDraft(chromeMock)).toBeUndefined();
  });

  it('keeps the draft and explains when the write does not persist', async () => {
    seedDraft(chromeMock, buildDraft());
    writes.conceptCards.mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    const response = await saveCapture(buildDraft());

    expect(response).toEqual({
      ok: false,
      reason: 'Storage is full. Free up some space to continue.',
    });
    expect(storedDraft(chromeMock)).toEqual(buildDraft());
  });

  it('does not mark a quote for sync when its write does not persist', async () => {
    writes.quotes.mockResolvedValue({ success: false, error: { type: 'unknown', message: 'x' } });

    await saveCapture(buildDraft({ kind: 'quote' }));

    expect(syncSink.markMutated).not.toHaveBeenCalled();
  });
});
