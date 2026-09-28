import { logger } from '@cuewise/shared';

/**
 * The DOM selection keeps the line breaks `selectionText` collapses. Empty when the page cannot be
 * scripted (chrome://, the PDF viewer, the Web Store) or the selection is inside a form field.
 */
export async function readPageSelection(tabId: number, frameId?: number): Promise<string> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
      func: () => String(getSelection()),
    });
    return typeof injection?.result === 'string' ? injection.result : '';
  } catch (error) {
    logger.debug('Could not read the page selection', { error });
    return '';
  }
}
