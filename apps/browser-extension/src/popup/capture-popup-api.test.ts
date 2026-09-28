import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildDraft,
  type CaptureChromeMock,
  DOM_SELECTION,
  installCaptureChromeMock,
  PAGE,
  seedDraft,
  storedDraft,
} from '../capture/__fixtures__/capture.fixtures';
import { chromeCapturePopupApi } from './capture-popup-api';

let chromeMock: CaptureChromeMock;

beforeEach(() => {
  chromeMock = installCaptureChromeMock();
});

describe('chromeCapturePopupApi.loadDraft', () => {
  it('resumes the pending draft for the tab the user is on', async () => {
    const pending = buildDraft({ kind: 'quote', author: 'Me' });
    seedDraft(chromeMock, pending);

    expect(await chromeCapturePopupApi.loadDraft()).toEqual(pending);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  // Otherwise the icon opens someone's abandoned capture from a page they have left.
  it('starts fresh when the pending draft belongs to another tab', async () => {
    seedDraft(
      chromeMock,
      buildDraft({ tabId: PAGE.tabId + 1, pageUrl: 'https://example.com/old' })
    );

    const draft = await chromeCapturePopupApi.loadDraft();

    expect(draft).toMatchObject({ pageUrl: PAGE.url, tabId: PAGE.tabId, text: DOM_SELECTION });
    expect(storedDraft(chromeMock)).toEqual(draft);
  });

  // The fallback window's own tab is the active one there, so the draft that opened it is all
  // there is — comparing tabs would throw away the capture the user just started. `tab.url` cannot
  // tell us: without the `tabs` permission it is undefined.
  it('resumes a draft from any tab inside the fallback window', async () => {
    const pending = buildDraft({ term: 'Half typed', tabId: PAGE.tabId + 1 });
    seedDraft(chromeMock, pending);
    chromeMock.tabs.getCurrent.mockResolvedValue({ id: 999 } as chrome.tabs.Tab);

    expect(await chromeCapturePopupApi.loadDraft()).toEqual(pending);
    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
  });

  it('drafts a concept from the active tab when nothing is pending', async () => {
    const draft = await chromeCapturePopupApi.loadDraft();

    expect(draft).toEqual({
      kind: 'concept',
      text: DOM_SELECTION,
      pageUrl: PAGE.url,
      pageTitle: PAGE.title,
      tabId: PAGE.tabId,
    });
    expect(storedDraft(chromeMock)).toEqual(draft);
  });

  it('drafts empty text from a tab it cannot script', async () => {
    chromeMock.scripting.executeScript.mockRejectedValue(
      new Error('Cannot access a chrome:// URL')
    );

    expect(await chromeCapturePopupApi.loadDraft()).toMatchObject({ text: '' });
  });

  it('ignores a stored draft of the wrong shape', async () => {
    chromeMock.storage.session.data.captureDraft = { kind: 'goal' };

    expect(await chromeCapturePopupApi.loadDraft()).toMatchObject({ kind: 'concept' });
  });
});

describe('chromeCapturePopupApi.save', () => {
  it('relays the draft to the service worker and returns its reply', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ ok: true });

    const response = await chromeCapturePopupApi.save(buildDraft());

    expect(response).toEqual({ ok: true });
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'capture:save',
      draft: buildDraft(),
    });
  });

  it('reports a failure when nothing answers', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue(undefined);

    expect(await chromeCapturePopupApi.save(buildDraft())).toMatchObject({ ok: false });
  });
});
