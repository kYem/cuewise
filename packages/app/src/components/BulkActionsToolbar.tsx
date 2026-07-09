import type { QuoteCollection } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  Eye,
  EyeOff,
  FolderPlus,
  Heart,
  HeartOff,
  Square,
  SquareCheck,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  isSelectionMode: boolean;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkFavorite: () => void;
  onBulkUnfavorite: () => void;
  onBulkHide: () => void;
  onBulkUnhide: () => void;
  onBulkDelete: () => void;
  onBulkAddToCollection?: (collectionId: string) => void;
  collections?: QuoteCollection[];
  hasSelectedFavorites: boolean;
  hasSelectedUnfavorited: boolean;
  hasSelectedHidden: boolean;
  hasSelectedVisible: boolean;
  isLoading?: boolean;
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedCount,
  totalCount,
  isSelectionMode,
  onToggleSelectionMode,
  onSelectAll,
  onDeselectAll,
  onBulkFavorite,
  onBulkUnfavorite,
  onBulkHide,
  onBulkUnhide,
  onBulkDelete,
  onBulkAddToCollection,
  collections = [],
  hasSelectedFavorites,
  hasSelectedUnfavorited,
  hasSelectedHidden,
  hasSelectedVisible,
  isLoading = false,
}) => {
  const hasSelection = selectedCount > 0;
  const [isCollectionPopoverOpen, setIsCollectionPopoverOpen] = useState(false);

  const handleAddToCollection = (collectionId: string) => {
    if (onBulkAddToCollection) {
      onBulkAddToCollection(collectionId);
    }
    setIsCollectionPopoverOpen(false);
  };

  return (
    <div className="bg-surface-variant border border-border rounded-lg p-3 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Selection Mode Toggle */}
        <button
          type="button"
          onClick={onToggleSelectionMode}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all text-sm',
            isSelectionMode
              ? 'bg-primary-600 text-white'
              : 'bg-surface text-primary hover:bg-surface-variant'
          )}
        >
          {isSelectionMode ? (
            <>
              <SquareCheck className="w-4 h-4" />
              Selection Mode
            </>
          ) : (
            <>
              <Square className="w-4 h-4" />
              Enable Selection
            </>
          )}
        </button>

        {isSelectionMode && (
          <>
            {/* Divider */}
            <div className="h-8 w-px bg-border" />

            {/* Selection Info */}
            <span className="text-sm text-secondary">
              {hasSelection ? (
                <span className="font-medium text-primary">{selectedCount} selected</span>
              ) : (
                'None selected'
              )}
            </span>

            {/* Select All / Deselect All */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                disabled={selectedCount === totalCount || isLoading}
                className="px-3 py-1.5 text-sm font-medium text-primary bg-surface hover:bg-surface-variant rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Select All ({totalCount})
              </button>
              <button
                type="button"
                onClick={onDeselectAll}
                disabled={!hasSelection || isLoading}
                className="px-3 py-1.5 text-sm font-medium text-primary bg-surface hover:bg-surface-variant rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deselect All
              </button>
            </div>

            {/* Divider */}
            {hasSelection && <div className="h-8 w-px bg-border" />}

            {/* Bulk Actions */}
            {hasSelection && (
              <div className="flex items-center gap-2">
                {/* Favorite / Unfavorite */}
                {hasSelectedUnfavorited && (
                  <button
                    type="button"
                    onClick={onBulkFavorite}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                    title="Add to favorites"
                  >
                    <Heart className="w-4 h-4" />
                    Favorite
                  </button>
                )}
                {hasSelectedFavorites && (
                  <button
                    type="button"
                    onClick={onBulkUnfavorite}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary bg-surface hover:bg-surface-variant rounded-md transition-colors disabled:opacity-50"
                    title="Remove from favorites"
                  >
                    <HeartOff className="w-4 h-4" />
                    Unfavorite
                  </button>
                )}

                {/* Hide / Unhide */}
                {hasSelectedVisible && (
                  <button
                    type="button"
                    onClick={onBulkHide}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary bg-surface hover:bg-surface-variant rounded-md transition-colors disabled:opacity-50"
                    title="Hide quotes"
                  >
                    <EyeOff className="w-4 h-4" />
                    Hide
                  </button>
                )}
                {hasSelectedHidden && (
                  <button
                    type="button"
                    onClick={onBulkUnhide}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors disabled:opacity-50"
                    title="Unhide quotes"
                  >
                    <Eye className="w-4 h-4" />
                    Unhide
                  </button>
                )}

                {/* Add to Collection */}
                {collections.length > 0 && onBulkAddToCollection && (
                  <Popover open={isCollectionPopoverOpen} onOpenChange={setIsCollectionPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors disabled:opacity-50"
                        title="Add to collection"
                      >
                        <FolderPlus className="w-4 h-4" />
                        Add to Collection
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-48 p-1 bg-surface/95 backdrop-blur-xl"
                      align="start"
                    >
                      <div className="max-h-48 overflow-y-auto">
                        {collections.map((collection) => (
                          <button
                            key={collection.id}
                            type="button"
                            onClick={() => handleAddToCollection(collection.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-surface-variant rounded-md transition-colors text-left"
                          >
                            <FolderPlus className="w-4 h-4 text-secondary" />
                            <span className="truncate">{collection.name}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Delete */}
                <button
                  type="button"
                  onClick={onBulkDelete}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
                  title="Delete quotes"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}

            {/* Exit Selection Mode */}
            <button
              type="button"
              onClick={onToggleSelectionMode}
              className="ml-auto p-2 text-secondary hover:text-primary hover:bg-surface rounded-md transition-colors"
              title="Exit selection mode"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
