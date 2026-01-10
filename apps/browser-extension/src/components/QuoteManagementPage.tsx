import {
  CATEGORY_COLORS,
  logger,
  QUOTE_CATEGORIES,
  type Quote,
  type QuoteCategory,
} from '@cuewise/shared';
import { cn, Select } from '@cuewise/ui';
import { FolderOpen, Plus, Search } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useQuoteSelection } from '../hooks/useQuoteSelection';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuoteForm } from './AddQuoteForm';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { CollectionList } from './CollectionList';
import { ConfirmationDialog } from './ConfirmationDialog';
import { EditQuoteModal } from './EditQuoteModal';
import { ErrorFallback } from './ErrorFallback';
import { PageHeader } from './PageHeader';
import { QuoteCard } from './QuoteCard';
import { QuoteRestorationMenu } from './QuoteRestorationMenu';

type FilterType = 'all' | 'custom' | 'default' | 'favorites' | 'hidden';
type TabType = 'quotes' | 'collections';

export const QuoteManagementPage: React.FC = () => {
  const {
    quotes,
    collections,
    activeCollectionIds,
    setActiveCollectionIds,
    addQuotesToCollection,
    isLoading,
    error,
    initialize,
    toggleFavorite,
    hideQuote,
    unhideQuote,
    editQuote,
    deleteQuote,
    bulkDelete,
    bulkToggleFavorite,
    bulkToggleHidden,
    restoreMissingQuotes,
    resetAllQuotes,
    getMissingSeedQuoteCount,
  } = useQuoteStore();

  const [activeTab, setActiveTab] = useState<TabType>('quotes');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedCategory, setSelectedCategory] = useState<QuoteCategory | 'all'>('all');
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Confirmation dialogs
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  // Filter and search quotes
  const filteredQuotes = useMemo(() => {
    let result = [...quotes];

    // Apply collection filter first (quote must be in at least one of the enabled collections)
    if (activeCollectionIds.length > 0) {
      result = result.filter((q) =>
        q.collectionIds?.some((id) => activeCollectionIds.includes(id))
      );
    }

    // Apply filter type
    if (filterType === 'custom') {
      result = result.filter((q) => q.isCustom);
    } else if (filterType === 'default') {
      result = result.filter((q) => !q.isCustom);
    } else if (filterType === 'favorites') {
      result = result.filter((q) => q.isFavorite);
    } else if (filterType === 'hidden') {
      result = result.filter((q) => q.isHidden);
    } else {
      // 'all' - show visible quotes by default
      result = result.filter((q) => !q.isHidden);
    }

    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter((q) => q.category === selectedCategory);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (q) =>
          q.text.toLowerCase().includes(query) ||
          q.author.toLowerCase().includes(query) ||
          q.source?.toLowerCase().includes(query) ||
          q.notes?.toLowerCase().includes(query)
      );
    }

    // Sort: favorites first, then by view count, then by custom
    result.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      if (a.viewCount !== b.viewCount) {
        return b.viewCount - a.viewCount;
      }
      if (a.isCustom !== b.isCustom) {
        return a.isCustom ? -1 : 1;
      }
      return 0;
    });

    return result;
  }, [quotes, searchQuery, filterType, selectedCategory, activeCollectionIds]);

  // Selection state and handlers
  const {
    selectedQuoteIds,
    isSelectionMode,
    hasSelectedFavorites,
    hasSelectedUnfavorited,
    hasSelectedHidden,
    hasSelectedVisible,
    handleSelectQuote,
    handleDeselectAll,
    handleToggleSelectionMode,
    handleSelectAll,
    clearSelection,
  } = useQuoteSelection({ quotes, filteredQuotes });

  useEffect(() => {
    if (quotes.length === 0 && !isLoading) {
      initialize();
    }
  }, [quotes.length, isLoading, initialize]);

  // Get missing seed quote count
  const missingSeedQuoteCount = getMissingSeedQuoteCount();

  // Bulk action handlers
  const handleBulkDelete = async () => {
    setIsBulkLoading(true);
    try {
      await bulkDelete(Array.from(selectedQuoteIds));
      clearSelection();
      setShowBulkDeleteConfirm(false);
    } catch (err) {
      logger.error('Bulk delete operation failed', err);
      setShowBulkDeleteConfirm(false);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkFavorite = async () => {
    setIsBulkLoading(true);
    try {
      await bulkToggleFavorite(Array.from(selectedQuoteIds), true);
    } catch (err) {
      logger.error('Bulk favorite operation failed', err);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkUnfavorite = async () => {
    setIsBulkLoading(true);
    try {
      await bulkToggleFavorite(Array.from(selectedQuoteIds), false);
    } catch (err) {
      logger.error('Bulk unfavorite operation failed', err);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkHide = async () => {
    setIsBulkLoading(true);
    try {
      await bulkToggleHidden(Array.from(selectedQuoteIds), true);
      clearSelection();
    } catch (err) {
      logger.error('Bulk hide operation failed', err);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkUnhide = async () => {
    setIsBulkLoading(true);
    try {
      await bulkToggleHidden(Array.from(selectedQuoteIds), false);
    } catch (err) {
      logger.error('Bulk unhide operation failed', err);
    } finally {
      setIsBulkLoading(false);
    }
  };

  // Restoration handlers
  const handleRestoreMissing = async () => {
    setIsBulkLoading(true);
    try {
      await restoreMissingQuotes();
    } catch (err) {
      logger.error('Restore missing quotes operation failed', err);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleResetAll = async () => {
    setIsBulkLoading(true);
    try {
      await resetAllQuotes();
      clearSelection();
      setShowResetAllConfirm(false);
    } catch (err) {
      logger.error('Reset all quotes operation failed', err);
      setShowResetAllConfirm(false);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkAddToCollection = async (collectionId: string) => {
    setIsBulkLoading(true);
    try {
      await addQuotesToCollection(Array.from(selectedQuoteIds), collectionId);
    } catch (err) {
      logger.error('Bulk add to collection operation failed', err);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleToggleFavorite = async (quoteId: string) => {
    await toggleFavorite(quoteId);
  };

  const handleToggleHidden = async (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (quote?.isHidden) {
      await unhideQuote(quoteId);
    } else {
      await hideQuote(quoteId);
    }
  };

  const handleDelete = async (quoteId: string) => {
    await deleteQuote(quoteId);
  };

  const handleEdit = (quote: Quote) => {
    setEditingQuote(quote);
  };

  const handleSaveEdit = async (
    quoteId: string,
    updates: {
      text?: string;
      author?: string;
      category?: QuoteCategory;
      source?: string;
      notes?: string;
    }
  ) => {
    await editQuote(quoteId, updates);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <ErrorFallback error={error} title="Failed to load quotes" onRetry={initialize} />
      </div>
    );
  }

  const stats = {
    total: quotes.length,
    custom: quotes.filter((q) => q.isCustom).length,
    favorites: quotes.filter((q) => q.isFavorite).length,
    hidden: quotes.filter((q) => q.isHidden).length,
  };

  // Get active collection names for display
  const activeCollectionNames = activeCollectionIds
    .map((id) => collections.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header with Navigation */}
      <PageHeader
        currentPage="quotes"
        title="Quote Management"
        subtitle={`Manage your collection of ${stats.total} quotes`}
      />

      {/* Tab Navigation */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-4" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setActiveTab('quotes')}
              className={cn(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'quotes'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-secondary hover:text-primary hover:border-border'
              )}
            >
              Quotes
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-surface-variant">
                {quotes.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('collections')}
              className={cn(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
                activeTab === 'collections'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-secondary hover:text-primary hover:border-border'
              )}
            >
              <FolderOpen className="w-4 h-4" />
              Collections
              <span className="px-2 py-0.5 text-xs rounded-full bg-surface-variant">
                {collections.length}
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* Collections Tab Content */}
      {activeTab === 'collections' && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <CollectionList onCollectionClick={() => setActiveTab('quotes')} />
        </div>
      )}

      {/* Quotes Tab Content */}
      {activeTab === 'quotes' && (
        <>
          {/* Main Content */}
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Add Quote Button and Restoration Menu */}
            <div className="flex justify-end gap-3 mb-6">
              <QuoteRestorationMenu
                missingSeedQuoteCount={missingSeedQuoteCount}
                onRestoreMissing={handleRestoreMissing}
                onResetAll={() => setShowResetAllConfirm(true)}
                isLoading={isBulkLoading}
              />
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-sm hover:shadow-md"
              >
                <Plus className="w-5 h-5" />
                Add Quote
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-primary-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-primary-700">{stats.total}</div>
                <div className="text-sm text-primary-600">Total Quotes</div>
              </div>
              <div className="bg-primary-100 rounded-lg p-4">
                <div className="text-2xl font-bold text-primary-800">{stats.custom}</div>
                <div className="text-sm text-primary-700">Custom Quotes</div>
              </div>
              <div className="bg-surface-variant rounded-lg p-4 border border-border">
                <div className="text-2xl font-bold text-primary">{stats.favorites}</div>
                <div className="text-sm text-secondary">Favorites</div>
              </div>
              <div className="bg-surface rounded-lg p-4 border border-border">
                <div className="text-2xl font-bold text-primary">{stats.hidden}</div>
                <div className="text-sm text-secondary">Hidden</div>
              </div>
            </div>

            {/* Active Collection Filter */}
            {activeCollectionIds.length > 0 && (
              <div className="flex items-center justify-between p-3 mb-6 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  <span className="text-sm text-primary-700 dark:text-primary-300">
                    Filtering by collection{activeCollectionIds.length > 1 ? 's' : ''}:{' '}
                    <strong>{activeCollectionNames}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCollectionIds([])}
                  className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 font-medium"
                >
                  Clear filter
                </button>
              </div>
            )}

            {/* Add Quote Form */}
            {showAddForm && (
              <div className="bg-surface-variant rounded-xl p-6 mb-6 border-2 border-border">
                <AddQuoteForm
                  onSuccess={() => setShowAddForm(false)}
                  onCancel={() => setShowAddForm(false)}
                />
              </div>
            )}

            {/* Search and Filters */}
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search quotes by text, author, source, or notes..."
                  className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-border text-primary placeholder:text-secondary focus:border-primary-500 focus:outline-none transition-colors"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                {/* Filter Type */}
                <div className="flex gap-2">
                  {(['all', 'custom', 'default', 'favorites', 'hidden'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFilterType(type)}
                      className={cn(
                        'px-4 py-2 rounded-lg font-medium transition-all',
                        filterType === type
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-surface text-primary hover:bg-surface-variant'
                      )}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Category Filter */}
                <Select
                  value={selectedCategory}
                  onChange={(value) => setSelectedCategory(value as QuoteCategory | 'all')}
                  options={[
                    { value: 'all', label: 'All Categories' },
                    ...Object.entries(QUOTE_CATEGORIES).map(([key, label]) => ({
                      value: key,
                      label: label,
                      color: CATEGORY_COLORS[key as QuoteCategory],
                    })),
                  ]}
                  aria-label="Filter by category"
                />
              </div>

              {/* Results count */}
              <div className="text-sm text-secondary">
                Showing {filteredQuotes.length} {filteredQuotes.length === 1 ? 'quote' : 'quotes'}
              </div>
            </div>
          </div>

          {/* Quote Grid */}
          <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Bulk Actions Toolbar */}
            <BulkActionsToolbar
              selectedCount={selectedQuoteIds.size}
              totalCount={filteredQuotes.length}
              isSelectionMode={isSelectionMode}
              onToggleSelectionMode={handleToggleSelectionMode}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onBulkFavorite={handleBulkFavorite}
              onBulkUnfavorite={handleBulkUnfavorite}
              onBulkHide={handleBulkHide}
              onBulkUnhide={handleBulkUnhide}
              onBulkDelete={() => setShowBulkDeleteConfirm(true)}
              onBulkAddToCollection={handleBulkAddToCollection}
              collections={collections}
              hasSelectedFavorites={hasSelectedFavorites}
              hasSelectedUnfavorited={hasSelectedUnfavorited}
              hasSelectedHidden={hasSelectedHidden}
              hasSelectedVisible={hasSelectedVisible}
              isLoading={isBulkLoading}
            />

            {filteredQuotes.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-xl text-secondary mb-4">No quotes found</p>
                <p className="text-tertiary">Try adjusting your filters or search query</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredQuotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleFavorite={handleToggleFavorite}
                    onToggleHidden={handleToggleHidden}
                    isSelected={selectedQuoteIds.has(quote.id)}
                    onSelectChange={handleSelectQuote}
                    showCheckbox={isSelectionMode}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingQuote && (
        <EditQuoteModal
          quote={editingQuote}
          onClose={() => setEditingQuote(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Delete Quotes"
        message={`Are you sure you want to delete ${selectedQuoteIds.size} ${selectedQuoteIds.size === 1 ? 'quote' : 'quotes'}? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isBulkLoading}
      />

      {/* Reset All Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showResetAllConfirm}
        onClose={() => setShowResetAllConfirm(false)}
        onConfirm={handleResetAll}
        title="Reset All Quotes"
        message="This will delete ALL quotes (including custom ones) and restore the default quotes. Are you sure?"
        confirmText="Reset All"
        variant="danger"
        isLoading={isBulkLoading}
      />
    </div>
  );
};
