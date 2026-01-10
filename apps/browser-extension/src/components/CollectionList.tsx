import type { Quote, QuoteCollection } from '@cuewise/shared';
import { ArrowLeft, Edit2, FolderOpen, ListPlus, Plus, Trash2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuotesToCollectionModal } from './AddQuotesToCollectionModal';
import { CollectionForm } from './CollectionForm';
import { ConfirmationDialog } from './ConfirmationDialog';
import { QuoteCard } from './QuoteCard';

export const CollectionList: React.FC = () => {
  const {
    collections,
    quotes,
    deleteCollection,
    toggleFavorite,
    hideQuote,
    unhideQuote,
    deleteQuote,
  } = useQuoteStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState<QuoteCollection | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<QuoteCollection | null>(null);
  const [addingToCollection, setAddingToCollection] = useState<QuoteCollection | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  // TODO: Add quote editing UI within collection view
  const [_editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleHidden = async (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (quote) {
      if (quote.isHidden) {
        await unhideQuote(quoteId);
      } else {
        await hideQuote(quoteId);
      }
    }
  };

  const getQuoteCount = (collectionId: string) => {
    return quotes.filter((q) => q.collectionIds?.includes(collectionId)).length;
  };

  const getQuotesInCollection = (collectionId: string) => {
    return quotes.filter((q) => !q.isHidden && q.collectionIds?.includes(collectionId));
  };

  const selectedCollection = selectedCollectionId
    ? collections.find((c) => c.id === selectedCollectionId)
    : null;

  const handleDelete = async () => {
    if (!deletingCollection) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCollection(deletingCollection.id);
      setDeletingCollection(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCollectionSelect = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
  };

  const handleBackToCollections = () => {
    setSelectedCollectionId(null);
  };

  // Show quotes in selected collection
  if (selectedCollection) {
    const collectionQuotes = getQuotesInCollection(selectedCollection.id);

    return (
      <div className="space-y-4">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToCollections}
            className="p-2 text-secondary hover:text-primary hover:bg-surface-variant rounded-lg transition-colors"
            title="Back to collections"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-primary">{selectedCollection.name}</h3>
            {selectedCollection.description && (
              <p className="text-sm text-secondary">{selectedCollection.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAddingToCollection(selectedCollection)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <ListPlus className="w-4 h-4" />
            Add Quotes
          </button>
        </div>

        {/* Quotes in Collection */}
        {collectionQuotes.length === 0 ? (
          <div className="text-center py-8">
            <FolderOpen className="w-12 h-12 mx-auto text-tertiary mb-3" />
            <p className="text-secondary">No quotes in this collection</p>
            <p className="text-sm text-tertiary mt-1">Add quotes to get started</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {collectionQuotes.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                onEdit={setEditingQuote}
                onDelete={deleteQuote}
                onToggleFavorite={toggleFavorite}
                onToggleHidden={handleToggleHidden}
              />
            ))}
          </div>
        )}

        {/* Add Quotes to Collection Modal */}
        {addingToCollection && (
          <AddQuotesToCollectionModal
            collection={addingToCollection}
            onClose={() => setAddingToCollection(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-primary">Collections</h3>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Collection
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-surface-variant rounded-lg p-4 border border-border">
          <CollectionForm onClose={() => setShowCreateForm(false)} />
        </div>
      )}

      {/* Edit Form */}
      {editingCollection && (
        <div className="bg-surface-variant rounded-lg p-4 border border-border">
          <CollectionForm
            collection={editingCollection}
            onClose={() => setEditingCollection(null)}
          />
        </div>
      )}

      {/* Collections List - hidden when editing */}
      {!editingCollection && collections.length === 0 && (
        <div className="text-center py-8">
          <FolderOpen className="w-12 h-12 mx-auto text-tertiary mb-3" />
          <p className="text-secondary">No collections yet</p>
          <p className="text-sm text-tertiary mt-1">Create a collection to organize your quotes</p>
        </div>
      )}
      {!editingCollection && collections.length > 0 && (
        <div className="grid gap-3">
          {collections.map((collection) => {
            const quoteCount = getQuoteCount(collection.id);

            return (
              // biome-ignore lint/a11y/useSemanticElements: Card with nested action buttons requires div wrapper
              <div
                key={collection.id}
                className="group flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer bg-surface border-border hover:bg-surface-variant"
                onClick={() => handleCollectionSelect(collection.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleCollectionSelect(collection.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 flex-shrink-0 text-tertiary" />
                    <h4 className="font-medium text-primary truncate">{collection.name}</h4>
                    <span className="text-sm text-secondary">
                      ({quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'})
                    </span>
                  </div>
                  {collection.description && (
                    <p className="text-sm text-secondary mt-1 ml-7 truncate">
                      {collection.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingToCollection(collection);
                    }}
                    className="p-2 text-secondary hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                    title="Add quotes to collection"
                  >
                    <ListPlus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCollection(collection);
                    }}
                    className="p-2 text-secondary hover:text-primary hover:bg-surface-variant rounded-lg transition-colors"
                    title="Edit collection"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingCollection(collection);
                    }}
                    className="p-2 text-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete collection"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deletingCollection}
        onClose={() => setDeletingCollection(null)}
        onConfirm={handleDelete}
        title="Delete Collection"
        message={`Are you sure you want to delete "${deletingCollection?.name}"? Quotes in this collection will not be deleted, only removed from the collection.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Add Quotes to Collection Modal */}
      {addingToCollection && (
        <AddQuotesToCollectionModal
          collection={addingToCollection}
          onClose={() => setAddingToCollection(null)}
        />
      )}
    </div>
  );
};
