import {
  assertPersisted,
  generateId,
  logger,
  notifyDeleted,
  notifyMutated,
  notifyMutatedBulk,
  type Quote,
  type QuoteCollection,
  storageWriteErrorMessage,
} from '@cuewise/shared';
import {
  getQuotes,
  setQuotes,
  updateCollections,
  updateQuotes,
  withCollectionLock,
} from '@cuewise/storage';
import type { StateCreator } from 'zustand';
import { useToastStore } from '../toast-store';
import {
  persistCurrentQuote,
  persistFilterSettings,
  persistOneQuote,
  refreshCardIfQuoteGone,
  reportQuoteGone,
  syncsLocalEdits,
} from './helpers';
import type { QuoteStore } from './types';

export type CollectionActions = Pick<
  QuoteStore,
  | 'createCollection'
  | 'updateCollection'
  | 'deleteCollection'
  | 'addQuoteToCollection'
  | 'removeQuoteFromCollection'
  | 'addQuotesToCollection'
  | 'toggleCollection'
  | 'setActiveCollectionIds'
  | 'getQuotesInCollection'
>;

export const createCollectionActions: StateCreator<QuoteStore, [], [], CollectionActions> = (
  set,
  get
) => ({
  createCollection: async (name: string, description?: string) => {
    try {
      const now = new Date().toISOString();

      const newCollection: QuoteCollection = {
        id: generateId(),
        name: name.trim(),
        description: description?.trim(),
        createdAt: now,
      };

      const { result, collections: updatedCollections } = await updateCollections((current) => [
        ...current,
        newCollection,
      ]);
      // setCollections resolves {success:false} on quota rather than throwing, so the catch below
      // never sees it and the collection would look created until the next read.
      if (!result.success) {
        logger.error('Failed to persist the new collection', result.error);
        const errorMessage = 'Failed to create collection. Please try again.';
        useToastStore.getState().error(storageWriteErrorMessage(result.error, errorMessage));
        return false;
      }
      set({ collections: updatedCollections, error: null });
      notifyMutated('collections', newCollection.id);

      useToastStore.getState().success(`Collection "${name}" created`);
      return true;
    } catch (error) {
      logger.error('Error creating collection', error);
      const errorMessage = 'Failed to create collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return false;
    }
  },

  updateCollection: async (id: string, updates) => {
    try {
      const now = new Date().toISOString();
      const applied = { found: false };

      const { result, collections: updatedCollections } = await updateCollections((current) =>
        current.map((c) => {
          if (c.id !== id) {
            return c;
          }
          applied.found = true;
          return { ...c, ...updates, updatedAt: now };
        })
      );
      if (!result.success) {
        logger.error('Failed to persist the collection update', result.error);
        const errorMessage = 'Failed to update collection. Please try again.';
        useToastStore.getState().error(storageWriteErrorMessage(result.error, errorMessage));
        return 'failed';
      }
      // Announcing a write that found nothing marks a gone id dirty, and the next push seals a
      // tombstone this device never authored.
      if (!applied.found) {
        logger.error(`updateCollection: collection ${id} was gone before the write`);
        useToastStore.getState().warning('This collection no longer exists');
        return 'gone';
      }
      set({ collections: updatedCollections, error: null });
      notifyMutated('collections', id);

      useToastStore.getState().success('Collection updated');
      return 'saved';
    } catch (error) {
      logger.error('Error updating collection', error);
      const errorMessage = 'Failed to update collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return 'failed';
    }
  },

  deleteCollection: async (id: string) => {
    try {
      // Remove collection
      const { result, collections: updatedCollections } = await updateCollections((current) =>
        current.filter((c) => c.id !== id)
      );
      if (!result.success) {
        logger.error('Failed to persist the collection deletion', result.error);
        const errorMessage = 'Failed to delete collection. Please try again.';
        useToastStore.getState().error(storageWriteErrorMessage(result.error, errorMessage));
        return false;
      }
      // Straight after the write, with nothing fallible in between: the steps below can throw, and
      // a tombstone that never pushes lets a peer still holding the collection resurrect it.
      notifyDeleted('collections', id);

      // Remove collection ID from all quotes that had it. Locked and re-read for its own sake:
      // losing this leaves quotes pointing at a collection that no longer exists.
      const unlink = await withCollectionLock<{ quotes: Quote[] | null; unlinked: boolean }>(
        'quotes',
        async () => {
          // Caught here, not by the outer catch: the collection is already deleted and tombstoned
          // by this point, so an unreadable quote read is not a failed delete.
          let current: Quote[];
          try {
            current = await getQuotes();
          } catch (error) {
            logger.error('Deleted the collection but could not read its quotes to unlink', error);
            return { quotes: null, unlinked: false };
          }
          const unlinkedCustomIds: string[] = [];
          const next = current.map((q) => {
            if (q.collectionIds?.includes(id)) {
              if (syncsLocalEdits(q)) {
                unlinkedCustomIds.push(q.id);
              }
              return { ...q, collectionIds: q.collectionIds.filter((cId) => cId !== id) };
            }
            return q;
          });
          const quotesResult = await setQuotes(next);
          if (!quotesResult.success) {
            logger.error(
              'Deleted the collection but could not unlink its quotes',
              quotesResult.error
            );
            return { quotes: current, unlinked: false };
          }
          // Membership lives on the quote, so an unannounced unlink is undone by the next pull.
          notifyMutatedBulk('quotes', unlinkedCustomIds);
          return { quotes: next, unlinked: true };
        }
      );

      // Read at use time: the user can toggle a collection filter while this waits on the locks,
      // and nothing converges this field afterwards.
      const newActiveIds = get().activeCollectionIds.filter((cId) => cId !== id);

      set({
        collections: updatedCollections,
        // Omitted when the read failed: there is no fresher list to commit than what is already here.
        ...(unlink.quotes !== null && { quotes: unlink.quotes }),
        activeCollectionIds: newActiveIds,
        error: null,
      });

      // Persist updated filter settings (collection removed from active filters)
      await persistFilterSettings(get());

      if (!unlink.unlinked) {
        useToastStore.getState().warning('Collection deleted, but its quotes still reference it');
        return true;
      }
      useToastStore.getState().success('Collection deleted');
      return true;
    } catch (error) {
      logger.error('Error deleting collection', error);
      const errorMessage = 'Failed to delete collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return false;
    }
  },

  addQuoteToCollection: async (quoteId: string, collectionId: string) => {
    try {
      const { currentQuote } = get();
      // Decided against the locked read: a pull may have added this membership already, and
      // announcing a write that changed nothing marks the quote dirty for no reason.
      const changed = { added: false };

      const write = await persistOneQuote(quoteId, (q) => {
        const currentIds = q.collectionIds ?? [];
        if (currentIds.includes(collectionId)) {
          return q;
        }
        changed.added = true;
        return { ...q, collectionIds: [...currentIds, collectionId] };
      });
      if (write.kind === 'gone') {
        set({ quotes: write.quotes, error: null });
        reportQuoteGone('addQuoteToCollection', quoteId);
        await refreshCardIfQuoteGone(quoteId, write.quotes, get);
        return 'gone';
      }
      const { quotes: updatedQuotes, target } = write;
      set({ quotes: updatedQuotes, error: null });
      if (changed.added && syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      // Update current quote if it was the one modified
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = updatedQuotes.find((q) => q.id === quoteId);
        if (updatedCurrentQuote) {
          await persistCurrentQuote(updatedCurrentQuote, 'addQuoteToCollection');
          set({ currentQuote: updatedCurrentQuote });
        }
      }

      return 'saved';
    } catch (error) {
      logger.error('Error adding quote to collection', error);
      const errorMessage = 'Failed to add quote to collection. Please try again.';
      // Collapsed for the same reason as reportQuoteGone: the modal applies one quote at a time,
      // and a full disk fails every one of them.
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, errorMessage), { collapseRepeats: true });
      return 'failed';
    }
  },

  removeQuoteFromCollection: async (quoteId: string, collectionId: string) => {
    try {
      const { currentQuote } = get();
      // Decided against the locked read, for the same reason as addQuoteToCollection.
      const changed = { removed: false };

      const write = await persistOneQuote(quoteId, (q) => {
        if (!q.collectionIds?.includes(collectionId)) {
          return q;
        }
        changed.removed = true;
        return { ...q, collectionIds: q.collectionIds.filter((cId) => cId !== collectionId) };
      });
      if (write.kind === 'gone') {
        set({ quotes: write.quotes, error: null });
        reportQuoteGone('removeQuoteFromCollection', quoteId);
        await refreshCardIfQuoteGone(quoteId, write.quotes, get);
        return 'gone';
      }
      const { quotes: updatedQuotes, target } = write;
      set({ quotes: updatedQuotes, error: null });
      if (changed.removed && syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      // Update current quote if it was the one modified
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = updatedQuotes.find((q) => q.id === quoteId);
        if (updatedCurrentQuote) {
          await persistCurrentQuote(updatedCurrentQuote, 'removeQuoteFromCollection');
          set({ currentQuote: updatedCurrentQuote });
        }
      }

      return 'saved';
    } catch (error) {
      logger.error('Error removing quote from collection', error);
      const errorMessage = 'Failed to remove quote from collection. Please try again.';
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, errorMessage), { collapseRepeats: true });
      return 'failed';
    }
  },

  addQuotesToCollection: async (quoteIds: string[], collectionId: string) => {
    try {
      const { collections, currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      // Only the ones this write actually moved: membership lives on the quote itself.
      const affectedCustomIds: string[] = [];
      // Separately from `added`: zero of both is a pull deleting them, zero added alone is
      // membership they already had.
      let matched = 0;
      let added = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) =>
        current.map((q) => {
          if (!quoteIdSet.has(q.id)) {
            return q;
          }
          matched += 1;
          const currentIds = q.collectionIds ?? [];
          if (currentIds.includes(collectionId)) {
            return q;
          }
          added += 1;
          if (syncsLocalEdits(q)) {
            affectedCustomIds.push(q.id);
          }
          return { ...q, collectionIds: [...currentIds, collectionId] };
        })
      );
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk('quotes', affectedCustomIds);

      const collection = collections.find((c) => c.id === collectionId);
      const collectionName = collection?.name ?? 'collection';
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        await refreshCardIfQuoteGone(currentQuote.id, updatedQuotes, get);
      }

      if (matched === 0) {
        // True, like bulkDelete: the write landed and matched nothing, which no retry fixes.
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      if (added === 0) {
        useToastStore.getState().info(`Those quotes are already in "${collectionName}"`);
        return true;
      }
      useToastStore.getState().success(`${added} quotes added to "${collectionName}"`);

      return true;
    } catch (error) {
      logger.error('Error adding quotes to collection', error);
      const errorMessage = 'Failed to add quotes to collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return false;
    }
  },

  toggleCollection: async (collectionId: string) => {
    const { activeCollectionIds } = get();
    if (activeCollectionIds.includes(collectionId)) {
      set({ activeCollectionIds: activeCollectionIds.filter((id) => id !== collectionId) });
    } else {
      set({ activeCollectionIds: [...activeCollectionIds, collectionId] });
    }
    await persistFilterSettings(get());
  },

  setActiveCollectionIds: async (collectionIds: string[]) => {
    set({ activeCollectionIds: collectionIds });
    await persistFilterSettings(get());
  },

  getQuotesInCollection: (collectionId: string) => {
    const { quotes } = get();
    return quotes.filter((q) => q.collectionIds?.includes(collectionId));
  },
});
