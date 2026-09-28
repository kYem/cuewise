import {
  buildConceptCard,
  buildCustomQuote,
  describeCapturedPage,
  logger,
  notifyMutated,
  storageWriteErrorMessage,
} from '@cuewise/shared';
import { updateConceptCards, updateQuotes } from '@cuewise/storage';
import {
  type CaptureDraft,
  type CaptureKind,
  captureDraftSchema,
  clearCaptureDraft,
  resolveCaptureFields,
  writeCaptureDraft,
} from './capture-draft';
import type { CaptureSaveResponse } from './capture-messages';
import { readPageSelection } from './page-selection';

export const CAPTURE_POPUP_PATH = 'popup.html';

// An explicit parent: two loose items get grouped under the full store name instead.
export const CAPTURE_MENU_IDS = {
  parent: 'cuewise-capture',
  concept: 'cuewise-capture-concept',
  quote: 'cuewise-capture-quote',
} as const;

const NOT_SAVED = 'Could not save. Please try again.';

function reportMenuError(): void {
  if (chrome.runtime.lastError) {
    logger.error('Could not create the capture menu item', chrome.runtime.lastError);
  }
}

export async function registerCaptureMenus(): Promise<void> {
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create(
      { id: CAPTURE_MENU_IDS.parent, title: 'Cuewise', contexts: ['selection'] },
      reportMenuError
    );
    chrome.contextMenus.create(
      {
        id: CAPTURE_MENU_IDS.concept,
        parentId: CAPTURE_MENU_IDS.parent,
        title: 'Save as concept',
        contexts: ['selection'],
      },
      reportMenuError
    );
    chrome.contextMenus.create(
      {
        id: CAPTURE_MENU_IDS.quote,
        parentId: CAPTURE_MENU_IDS.parent,
        title: 'Save as quote',
        contexts: ['selection'],
      },
      reportMenuError
    );
  } catch (error) {
    logger.error('Could not register the capture menu', error);
  }
}

function kindForMenuItem(menuItemId: string | number): CaptureKind | null {
  if (menuItemId === CAPTURE_MENU_IDS.concept) {
    return 'concept';
  }
  if (menuItemId === CAPTURE_MENU_IDS.quote) {
    return 'quote';
  }
  return null;
}

export async function openCapturePopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch (error) {
    logger.debug('openPopup refused, opening the capture window instead', { error });
    await chrome.windows.create({
      type: 'popup',
      url: chrome.runtime.getURL(CAPTURE_POPUP_PATH),
      width: 380,
      height: 460,
    });
  }
}

export async function handleCaptureMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const kind = kindForMenuItem(info.menuItemId);
  if (kind === null) {
    return;
  }
  try {
    const domSelection = tab?.id === undefined ? '' : await readPageSelection(tab.id, info.frameId);
    const draft: CaptureDraft = {
      kind,
      text: domSelection.trim() ? domSelection : (info.selectionText ?? ''),
      pageUrl: info.pageUrl ?? tab?.url ?? '',
      pageTitle: tab?.title,
      tabId: tab?.id,
    };
    await writeCaptureDraft(draft);
    await openCapturePopup();
  } catch (error) {
    logger.error('Could not start a capture from the context menu', error);
  }
}

async function persistCapture(draft: CaptureDraft): Promise<CaptureSaveResponse> {
  const fields = resolveCaptureFields(draft);
  const { source, sourceUrl } = describeCapturedPage(draft.pageUrl, draft.pageTitle);

  if (draft.kind === 'concept') {
    if (!fields.term.trim() || !fields.definition.trim()) {
      return { ok: false, reason: 'Add a term and a definition first.' };
    }
    const card = buildConceptCard(
      { term: fields.term, definition: fields.definition, source, sourceUrl },
      new Date()
    );
    const { result } = await updateConceptCards((current) => [...current, card]);
    if (result.success === false) {
      logger.error('Could not persist the captured concept', result.error);
      return { ok: false, reason: storageWriteErrorMessage(result.error, NOT_SAVED) };
    }
    return { ok: true };
  }

  if (!fields.quoteText.trim()) {
    return { ok: false, reason: 'Add the quote text first.' };
  }
  const quote = buildCustomQuote({
    text: fields.quoteText,
    author: fields.author.trim() || 'Unknown',
    category: 'inspiration',
    source,
    sourceUrl,
  });
  const { result } = await updateQuotes((current) => [...current, quote]);
  if (result.success === false) {
    logger.error('Could not persist the captured quote', result.error);
    return { ok: false, reason: storageWriteErrorMessage(result.error, NOT_SAVED) };
  }
  notifyMutated('quotes', quote.id);
  return { ok: true };
}

export async function saveCapture(draft: unknown): Promise<CaptureSaveResponse> {
  const parsed = captureDraftSchema.safeParse(draft);
  if (!parsed.success) {
    logger.error('Refused a malformed capture draft');
    return { ok: false, reason: NOT_SAVED };
  }
  try {
    const response = await persistCapture(parsed.data);
    if (response.ok) {
      // A draft left behind would reopen the saved item and invite saving it twice.
      await clearCaptureDraft().catch((error: unknown) => {
        logger.error('Saved the capture but could not clear its draft', error);
      });
    }
    return response;
  } catch (error) {
    logger.error('Could not save the capture', error);
    return { ok: false, reason: storageWriteErrorMessage(error, NOT_SAVED) };
  }
}
