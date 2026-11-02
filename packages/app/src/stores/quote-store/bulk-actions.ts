import {
  assertPersisted,
  type BulkImportResult,
  type CSVQuoteRow,
  logger,
  notifyDeleted,
  notifyMutatedBulk,
  type Quote,
  storageWriteErrorMessage,
} from '@cuewise/shared';
import { getQuotesRaw, setQuotesRaw, updateQuotes, withCollectionLock } from '@cuewise/storage';
import type { StateCreator } from 'zustand';
import { SEED_QUOTES } from '../../data/seed-quotes';
import { useToastStore } from '../toast-store';
import {
  CARD_NOT_REMEMBERED,
  getMissingSeedQuotes,
  persistCurrentQuote,
  pickQuote,
  refreshCardIfQuoteGone,
  syncsLocalEdits,
} from './helpers';
import type { QuoteStore } from './types';

export type BulkActions = Pick<
  QuoteStore,
  | 'bulkDelete'
  | 'bulkToggleFavorite'
  | 'bulkToggleHidden'
  | 'bulkAddQuotes'
  | 'restoreMissingQuotes'
  | 'resetAllQuotes'
  | 'getMissingSeedQuoteCount'
>;

export const createBulkActions: StateCreator<QuoteStore, [], [], BulkActions> = (set, get) => ({
  bulkDelete: async (quoteIds: string[]) => {
    try {
      const { currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      // Collected from the locked read: a pull may have removed some of these, and a tombstone
      // for one this write never deleted is authorship we do not have.
      const deletedCustomIds: string[] = [];
      // Not deletedCustomIds.length: seed quotes are deletable too, they are just not announced.
      let matched = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        for (const q of current) {
          if (!quoteIdSet.has(q.id)) {
            continue;
          }
          matched += 1;
          if (syncsLocalEdits(q)) {
            deletedCustomIds.push(q.id);
          }
        }
        return current.filter((q) => !quoteIdSet.has(q.id));
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      for (const id of deletedCustomIds) {
        notifyDeleted('quotes', id);
      }

      // If current quote was deleted, refresh to a new one
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        await get().refreshQuote();
      }

      if (matched === 0) {
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      useToastStore.getState().success(`Deleted ${matched} quotes`);
      return true;
    } catch (error) {
      logger.error('Error bulk deleting quotes', error, { quoteIds, count: quoteIds.length });
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to delete quotes. Please try again.'));
      return false;
    }
  },

  bulkToggleFavorite: async (quoteIds: string[], setFavorite: boolean) => {
    try {
      const { currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const affectedCustomIds: string[] = [];
      let matched = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        for (const q of current) {
          if (!quoteIdSet.has(q.id)) {
            continue;
          }
          matched += 1;
          if (syncsLocalEdits(q)) {
            affectedCustomIds.push(q.id);
          }
        }
        return current.map((q) => (quoteIdSet.has(q.id) ? { ...q, isFavorite: setFavorite } : q));
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk('quotes', affectedCustomIds);

      // The persisted value: a pull may have changed this quote while the write held the lock.
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        const persisted = updatedQuotes.find((q) => q.id === currentQuote.id);
        if (persisted) {
          await persistCurrentQuote(persisted, 'bulkToggleFavorite');
          set({ currentQuote: persisted });
        } else {
          await refreshCardIfQuoteGone(currentQuote.id, updatedQuotes, get);
        }
      }

      if (matched === 0) {
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      const action = setFavorite ? 'added to favorites' : 'removed from favorites';
      useToastStore.getState().success(`${matched} quotes ${action}`);
      return true;
    } catch (error) {
      logger.error('Error bulk toggling favorites', error, {
        quoteIds,
        setFavorite,
        count: quoteIds.length,
      });
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to update favorites. Please try again.'));
      return false;
    }
  },

  bulkToggleHidden: async (quoteIds: string[], setHidden: boolean) => {
    try {
      const { currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const affectedCustomIds: string[] = [];
      let matched = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        for (const q of current) {
          if (!quoteIdSet.has(q.id)) {
            continue;
          }
          matched += 1;
          if (syncsLocalEdits(q)) {
            affectedCustomIds.push(q.id);
          }
        }
        return current.map((q) => (quoteIdSet.has(q.id) ? { ...q, isHidden: setHidden } : q));
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk('quotes', affectedCustomIds);

      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        const persisted = updatedQuotes.find((q) => q.id === currentQuote.id);
        if (!persisted) {
          await refreshCardIfQuoteGone(currentQuote.id, updatedQuotes, get);
        } else if (setHidden) {
          await get().refreshQuote();
        } else {
          await persistCurrentQuote(persisted, 'bulkToggleHidden');
          set({ currentQuote: persisted });
        }
      }

      if (matched === 0) {
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      const action = setHidden ? 'hidden' : 'unhidden';
      useToastStore.getState().success(`${matched} quotes ${action}`);
      return true;
    } catch (error) {
      logger.error('Error bulk toggling hidden', error, {
        quoteIds,
        setHidden,
        count: quoteIds.length,
      });
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to update quotes. Please try again.'));
      return false;
    }
  },

  restoreMissingQuotes: async () => {
    try {
      if (getMissingSeedQuotes(get().quotes).length === 0) {
        useToastStore.getState().info('All default quotes are already present');
        return { restored: 0 };
      }

      // Recomputed against the locked read: a pull may have restored some of them already, and
      // adding those again would duplicate ids.
      let restored = 0;
      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        const missing = getMissingSeedQuotes(current);
        restored = missing.length;
        return [...current, ...missing];
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });

      if (restored === 0) {
        useToastStore.getState().info('All default quotes are already present');
        return { restored: 0 };
      }
      useToastStore.getState().success(`Restored ${restored} missing quotes`);
      return { restored };
    } catch (error) {
      logger.error('Error restoring missing quotes', error);
      const errorMessage = 'Failed to restore quotes. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      throw error;
    }
  },

  resetAllQuotes: async () => {
    try {
      // Create fresh copy of seed quotes with default properties
      let cardForgotten = false;
      const freshQuotes = SEED_QUOTES.map((q) => ({
        ...q,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
        lastViewed: undefined,
      }));

      // Raw: a reset means every stored quote, including one this build cannot parse, and the
      // preserving setter would carry those through.
      const wiped: string[] = [];
      let unusable = 0;
      const tombstones = { complete: true };
      const resetResult = await withCollectionLock('quotes', async () => {
        // Raw, to match the raw write: the validating read drops rows this build cannot parse,
        // and the write destroys them anyway — their ids need tombstones too. Failing to read
        // must not block the reset, which is the escape hatch for unreadable storage.
        try {
          for (const quote of await getQuotesRaw()) {
            // The raw read validates nothing, and an id the server rejects wedges every later
            // push for this device, not just this record.
            if (typeof quote?.id !== 'string' || quote.id === '') {
              unusable += 1;
              tombstones.complete = false;
              continue;
            }
            if (syncsLocalEdits(quote)) {
              wiped.push(quote.id);
            }
          }
        } catch (error) {
          tombstones.complete = false;
          logger.error('Resetting quotes without tombstones: could not read what is stored', error);
        }
        return setQuotesRaw(freshQuotes);
      });
      assertPersisted(resetResult);
      // error, not warn: the shipped logLevel is 'error', and rows destroyed with no tombstone
      // possible are the kind of thing that has to survive to a report. After the write, so it
      // cannot claim a destruction a failed reset never performed.
      if (unusable > 0) {
        logger.error(`Reset destroyed ${unusable} stored rows with no usable quote id`);
      }
      set({ quotes: freshQuotes, error: null });
      // Without these the reset is local only: every peer still holding these pushes them back.
      for (const id of wiped) {
        notifyDeleted('quotes', id);
      }

      const newCurrent = pickQuote(freshQuotes, get());
      if (newCurrent === null) {
        set({ currentQuote: null, quoteHistory: [], historyIndex: 0 });
      } else {
        cardForgotten = !(await persistCurrentQuote(newCurrent, 'resetAllQuotes'));
        set({
          currentQuote: newCurrent,
          quoteHistory: [newCurrent.id],
          historyIndex: 0,
        });
      }

      if (cardForgotten) {
        useToastStore.getState().warning(CARD_NOT_REMEMBERED, { collapseRepeats: true });
      }
      if (tombstones.complete) {
        useToastStore.getState().success('All quotes reset to defaults');
      } else {
        useToastStore
          .getState()
          .warning(
            "Quotes reset, but Cuewise couldn't read what it replaced. If you use sync, some may return from your other devices."
          );
      }
    } catch (error) {
      logger.error('Error resetting quotes', error);
      const errorMessage = 'Failed to reset quotes. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      throw error;
    }
  },

  getMissingSeedQuoteCount: () => {
    return getMissingSeedQuotes(get().quotes).length;
  },

  // CSV Import - Bulk add quotes with optional collection assignment
  bulkAddQuotes: async (quoteRows: CSVQuoteRow[], collectionId?: string) => {
    const result: BulkImportResult = {
      success: false,
      imported: 0,
      failed: 0,
      errors: [],
    };

    if (quoteRows.length === 0) {
      result.errors.push('No quotes to import');
      return result;
    }

    try {
      const timestamp = Date.now();

      // Create Quote objects from CSV rows
      const newQuotes: Quote[] = quoteRows.map((row, index) => ({
        id: `custom-${timestamp}-${index}`,
        text: row.text,
        author: row.author,
        category: row.category || 'inspiration',
        isCustom: true,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
        source: row.source,
        notes: row.notes,
        collectionIds: collectionId ? [collectionId] : undefined,
      }));

      // Add to existing quotes
      const { result: writeResult, quotes: updatedQuotes } = await updateQuotes((current) => [
        ...current,
        ...newQuotes,
      ]);
      assertPersisted(writeResult);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk(
        'quotes',
        newQuotes.map((quote) => quote.id)
      );

      result.success = true;
      result.imported = newQuotes.length;

      const collectionText = collectionId ? ' and added to collection' : '';
      useToastStore.getState().success(`Imported ${newQuotes.length} quotes${collectionText}`);

      return result;
    } catch (error) {
      logger.error('Error bulk adding quotes', error);
      const errorMessage = 'Failed to import quotes. Please try again.';
      result.errors.push(errorMessage);
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return result;
    }
  },
});
