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
  it('resumes the pending draft without touching the tab', async () => {
    const pending = buildDraft({ kind: 'quote', author: 'Me' });
    seedDraft(chromeMock, pending);

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
