import type { QuoteCollection } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Edit2, FolderOpen, ListPlus, Plus, Trash2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuotesToCollectionModal } from './AddQuotesToCollectionModal';
import { CollectionForm } from './CollectionForm';
import { ConfirmationDialog } from './ConfirmationDialog';

interface CollectionListProps {
  onCollectionClick?: (collectionId: string) => void;
}

export const CollectionList: React.FC<CollectionListProps> = ({ onCollectionClick }) => {
  const { collections, quotes, deleteCollection, activeCollectionId, setActiveCollection } =
    useQuoteStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState<QuoteCollection | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<QuoteCollection | null>(null);
  const [addingToCollection, setAddingToCollection] = useState<QuoteCollection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getQuoteCount = (collectionId: string) => {
    return quotes.filter((q) => q.collectionIds?.includes(collectionId)).length;
  };

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
    if (activeCollectionId === collectionId) {
      setActiveCollection(null);
    } else {
      setActiveCollection(collectionId);
    }
    if (onCollectionClick) {
      onCollectionClick(collectionId);
    }
  };

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

      {/* Collections List */}
      {collections.length === 0 ? (
        <div className="text-center py-8">
          <FolderOpen className="w-12 h-12 mx-auto text-tertiary mb-3" />
          <p className="text-secondary">No collections yet</p>
          <p className="text-sm text-tertiary mt-1">Create a collection to organize your quotes</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {collections.map((collection) => {
            const quoteCount = getQuoteCount(collection.id);
            const isActive = activeCollectionId === collection.id;

            return (
              // biome-ignore lint/a11y/useSemanticElements: Card with nested action buttons requires div wrapper
              <div
                key={collection.id}
                className={cn(
                  'group flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer',
                  isActive
                    ? 'bg-primary-50 border-primary-300 dark:bg-primary-900/20 dark:border-primary-700'
                    : 'bg-surface border-border hover:bg-surface-variant'
                )}
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
                    <FolderOpen
                      className={cn(
                        'w-5 h-5 flex-shrink-0',
                        isActive ? 'text-primary-600' : 'text-tertiary'
                      )}
                    />
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

      {/* Active Collection Filter Indicator */}
      {activeCollectionId && (
        <div className="flex items-center justify-between p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
          <span className="text-sm text-primary-700 dark:text-primary-300">
            Filtering by:{' '}
            <strong>{collections.find((c) => c.id === activeCollectionId)?.name}</strong>
          </span>
          <button
            type="button"
            onClick={() => setActiveCollection(null)}
            className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 font-medium"
          >
            Clear filter
          </button>
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
