import {
  assertPersisted,
  getRandomQuote,
  logger,
  type Quote,
  type QuoteCategory,
} from '@cuewise/shared';
import { getQuotes, setCurrentQuote, setQuotes, withCollectionLock } from '@cuewise/storage';
import { SEED_QUOTES } from '../../data/seed-quotes';
import { useSettingsStore } from '../settings-store';
import { useToastStore } from '../toast-store';
import type { QuoteStore } from './types';

/** Seed quotes not present in the given list, keyed by id. */
export function getMissingSeedQuotes(quotes: Quote[]): Quote[] {
  const existingIds = new Set(quotes.map((q) => q.id));
  return SEED_QUOTES.filter((sq) => !existingIds.has(sq.id));
}

/**
 * Step one entry through quote history. 'back' moves toward older quotes, 'forward' toward
 * newer ones. Hidden/deleted quotes are skipped by recursing in the same direction.
 */
export async function navigateHistory(
  get: () => QuoteStore,
  set: (partial: Partial<QuoteStore>) => void,
  direction: 'back' | 'forward'
): Promise<void> {
  const isBack = direction === 'back';
  try {
    const { quotes, quoteHistory, historyIndex } = get();

    // Already at the end of history in this direction
    if (isBack ? historyIndex >= quoteHistory.length - 1 : historyIndex <= 0) {
      return;
    }

    const newIndex = isBack ? historyIndex + 1 : historyIndex - 1;
    const quoteId = quoteHistory[newIndex];
    const quote = quotes.find((q) => q.id === quoteId);

    if (quote && !quote.isHidden) {
      if (!(await persistCurrentQuote(quote, 'navigateHistory'))) {
        useToastStore.getState().warning(CARD_NOT_REMEMBERED, { collapseRepeats: true });
      }
      set({ currentQuote: quote, historyIndex: newIndex });
      await get().incrementViewCount(quote.id);
    } else {
      // Quote was deleted or hidden, skip it
      set({ historyIndex: newIndex });
      await navigateHistory(get, set, direction);
    }
  } catch (error) {
    logger.error(`Error going ${direction} in history`, error);
    // Not `error` state: both renderers read that as "the load failed" and replace the page.
    // A single action that failed has its toast.
    useToastStore.getState().error(`Failed to navigate ${direction}. Please try again.`);
  }
}

/**
 * Persists current filter settings. Goes through the settings store rather than storage directly:
 * that path is serialized against other settings writes, checks the result, surfaces its own error
 * toast, and notifies sync for each changed key (the quoteFilter* keys are not device-local).
 */
export async function persistFilterSettings(state: QuoteStore): Promise<void> {
  await useSettingsStore.getState().updateSettings({
    quoteFilterEnabledCategories: state.enabledCategories,
    quoteFilterShowCustomQuotes: state.showCustomQuotes,
    quoteFilterShowFavoritesOnly: state.showFavoritesOnly,
    quoteFilterActiveCollectionIds: state.activeCollectionIds,
  });
}

/**
 * A write aimed at one quote. Both members carry a list storage has vouched for: `gone` never
 * wrote, and a write that fails throws instead of answering. Announcing a gone id would mark it
 * dirty, which pushes as a tombstone this device never made.
 */
type OneQuoteWrite =
  | { kind: 'gone'; quotes: Quote[] }
  | { kind: 'saved'; quotes: Quote[]; target: Quote };

export async function persistOneQuote(
  quoteId: string,
  change: (quote: Quote) => Quote
): Promise<OneQuoteWrite> {
  // Its own lock rather than updateQuotes, so a gone id skips the write entirely: rewriting an
  // identical list can still fail, and the caller would report that instead of the gone.
  return withCollectionLock('quotes', async (): Promise<OneQuoteWrite> => {
    const current = await getQuotes();
    // Boxed because TypeScript does not track an assignment inside the callback: a bare `let`
    // narrows to `never` past the guard, and the compiler stops checking `target` altogether.
    const hit: { target: Quote | null } = { target: null };
    const quotes = current.map((q) => {
      if (q.id !== quoteId) {
        return q;
      }
      hit.target = change(q);
      return hit.target;
    });
    if (hit.target === null) {
      return { kind: 'gone', quotes: current };
    }
    assertPersisted(await setQuotes(quotes));
    return { kind: 'saved', quotes, target: hit.target };
  });
}

/**
 * Seed quotes do reach the account — the enroll backfill claims every stored id — but only a
 * custom quote's edit is announced from here, so a seed edit stays on this device.
 */
export function syncsLocalEdits(quote: Quote | null): boolean {
  return quote?.isCustom === true;
}

/**
 * The card's own key. `initialize` reads back only its id and re-resolves it against the list,
 * so losing this write matters only where the id changes AND the stored one still resolves: a
 * writer that keeps the id, or one replacing an id the list no longer holds, loses nothing.
 * Answers rather than throwing: the list write has usually already landed, and `getStorageArea`
 * rejects, so both exits have to end up in the same place.
 */
export async function persistCurrentQuote(quote: Quote, action: string): Promise<boolean> {
  try {
    const result = await setCurrentQuote(quote);
    if (result?.success !== true) {
      logger.error(`${action}: could not persist the displayed quote`, result?.error, {
        quoteId: quote.id,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.error(`${action}: could not persist the displayed quote`, error, { quoteId: quote.id });
    return false;
  }
}

/**
 * The card renders `currentQuote`, which no observer converges, so a writer that finds the quote
 * gone has to move the card itself.
 *
 * Checked against `written` rather than trusted from the call site: a caller that reaches here
 * with the quote still present would otherwise reroll the card for no reason.
 */
export async function refreshCardIfQuoteGone(
  quoteId: string,
  written: Quote[],
  get: () => QuoteStore
): Promise<void> {
  const isGone = !written.some((q) => q.id === quoteId);
  if (isGone && get().currentQuote?.id === quoteId) {
    await get().refreshQuote();
  }
}

/** The locked read no longer holds it: a pull deleted it between the user's click and the write. */
export function reportQuoteGone(action: string, quoteId: string): void {
  // error, not warn: the shipped logLevel is 'error', and this is where a "but it's right
  // there" report starts.
  logger.error(`${action}: quote ${quoteId} was gone before the write`);
  // Collapsed: AddQuotesToCollectionModal applies its pending changes one quote at a time, so a
  // pull that removed the selection would otherwise stack one identical toast per quote.
  useToastStore.getState().warning('This quote no longer exists', { collapseRepeats: true });
}

/** Only `initialize` reads the card key, so a lost write shows up on the next tab, not this one. */
export const CARD_NOT_REMEMBERED =
  "Couldn't remember this quote — the next tab you open may still show the previous one.";

/** The four fields the pick filters on, named so the two adjacent booleans cannot be transposed. */
interface QuoteFilters {
  enabledCategories: QuoteCategory[];
  showCustomQuotes: boolean;
  showFavoritesOnly: boolean;
  activeCollectionIds: string[];
}

export function pickQuote(
  quotes: Quote[],
  filters: QuoteFilters,
  excludeId?: string
): Quote | null {
  return getRandomQuote(
    quotes,
    excludeId,
    filters.enabledCategories,
    filters.showCustomQuotes,
    filters.showFavoritesOnly,
    filters.activeCollectionIds
  );
}
