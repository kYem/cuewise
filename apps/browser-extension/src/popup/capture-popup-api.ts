import { type CaptureDraft, readCaptureDraft, writeCaptureDraft } from '../capture/capture-draft';
import {
  CAPTURE_SAVE,
  type CaptureSaveMessage,
  type CaptureSaveResponse,
} from '../capture/capture-messages';
import { readPageSelection } from '../capture/page-selection';

export interface CapturePopupApi {
  /** The pending draft, else a fresh one from the active tab's selection. */
  loadDraft: () => Promise<CaptureDraft>;
  persistDraft: (draft: CaptureDraft) => Promise<void>;
  save: (draft: CaptureDraft) => Promise<CaptureSaveResponse>;
  close: () => void;
}

const NO_REPLY = 'Cuewise did not answer. Please try again.';

export const chromeCapturePopupApi: CapturePopupApi = {
  loadDraft: async () => {
    const pending = await readCaptureDraft();
    if (pending !== null) {
      return pending;
    }
    // Opened from the icon or the shortcut: that gesture grants activeTab on the page behind.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const draft: CaptureDraft = {
      kind: 'concept',
      text: tab?.id === undefined ? '' : await readPageSelection(tab.id),
      pageUrl: tab?.url ?? '',
      pageTitle: tab?.title,
      tabId: tab?.id,
    };
    await writeCaptureDraft(draft);
    return draft;
  },
  persistDraft: writeCaptureDraft,
  save: async (draft) => {
    const response = await chrome.runtime.sendMessage<
      CaptureSaveMessage,
      CaptureSaveResponse | undefined
    >({ type: CAPTURE_SAVE, draft });
    return response ?? { ok: false, reason: NO_REPLY };
  },
  close: () => window.close(),
};
