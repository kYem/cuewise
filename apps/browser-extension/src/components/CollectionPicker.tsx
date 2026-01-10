import type { Quote } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Check, FolderOpen, FolderPlus, Plus } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';

interface CollectionPickerProps {
  quote: Quote;
  trigger: React.ReactNode;
}

export const CollectionPicker: React.FC<CollectionPickerProps> = ({ quote, trigger }) => {
  const { collections, addQuoteToCollection, removeQuoteFromCollection, createCollection } =
    useQuoteStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quoteCollectionIds = quote.collectionIds ?? [];

  const handleToggleCollection = async (collectionId: string) => {
    const isInCollection = quoteCollectionIds.includes(collectionId);

    if (isInCollection) {
      await removeQuoteFromCollection(quote.id, collectionId);
    } else {
      await addQuoteToCollection(quote.id, collectionId);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = newCollectionName.trim();
    if (!trimmedName) {
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await createCollection(trimmedName);
      if (success) {
        setNewCollectionName('');
        setIsCreating(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-0 bg-surface/95 backdrop-blur-xl" align="end">
        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-primary px-2 py-1">
            <FolderOpen className="w-4 h-4" />
            Add to Collection
          </div>
        </div>

        {/* Collections List */}
        <div className="max-h-64 overflow-y-auto p-1">
          {collections.length === 0 && !isCreating ? (
            <div className="text-center py-4 px-2">
              <FolderPlus className="w-8 h-8 mx-auto text-tertiary mb-2" />
              <p className="text-sm text-secondary">No collections yet</p>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Create your first collection
              </button>
            </div>
          ) : (
            collections.map((collection) => {
              const isInCollection = quoteCollectionIds.includes(collection.id);

              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => handleToggleCollection(collection.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors',
                    isInCollection
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-surface-variant text-primary'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                      isInCollection ? 'bg-primary-600 border-primary-600' : 'border-border'
                    )}
                  >
                    {isInCollection && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="truncate">{collection.name}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Create New Collection */}
        {isCreating ? (
          <form onSubmit={handleCreateCollection} className="p-2 border-t border-border">
            <input
              type="text"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="Collection name..."
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-surface text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none"
              disabled={isSubmitting}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewCollectionName('');
                }}
                className="px-3 py-1.5 text-sm text-secondary hover:text-primary transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newCollectionName.trim() || isSubmitting}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        ) : (
          collections.length > 0 && (
            <div className="p-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-surface-variant rounded-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create new collection
              </button>
            </div>
          )
        )}
      </PopoverContent>
    </Popover>
  );
};
