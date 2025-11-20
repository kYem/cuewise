import { CATEGORY_COLORS, QUOTE_CATEGORIES, type Quote, type QuoteCategory } from '@cuewise/shared';
import { cn, Select } from '@cuewise/ui';
import { ArrowLeft, Edit2, Eye, EyeOff, Heart, Plus, Search, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuoteForm } from './AddQuoteForm';
import { ErrorFallback } from './ErrorFallback';

type FilterType = 'all' | 'custom' | 'default' | 'favorites' | 'hidden';

interface EditQuoteModalProps {
  quote: Quote;
  onClose: () => void;
  onSave: (
    quoteId: string,
    updates: {
      text?: string;
      author?: string;
      category?: QuoteCategory;
      source?: string;
      notes?: string;
    }
  ) => Promise<void>;
}

const EditQuoteModal: React.FC<EditQuoteModalProps> = ({ quote, onClose, onSave }) => {
  const [text, setText] = useState(quote.text);
  const [author, setAuthor] = useState(quote.author);
  const [category, setCategory] = useState<QuoteCategory>(quote.category);
  const [source, setSource] = useState(quote.source || '');
  const [notes, setNotes] = useState(quote.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSave(quote.id, {
        text: text.trim(),
        author: author.trim(),
        category,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save quote:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-elevated rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface-elevated border-b border-divider px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-primary">Edit Quote</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-variant rounded-full transition-colors text-secondary"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Quote Text */}
          <div>
            <label
              htmlFor="edit-quote-text"
              className="block text-sm font-medium text-primary mb-2"
            >
              Quote Text <span className="text-red-500">*</span>
            </label>
            <textarea
              id="edit-quote-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the quote..."
              required
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 rounded-lg border-2 border-border bg-surface text-primary placeholder:text-secondary focus:border-primary-500 focus:outline-none transition-colors resize-none"
            />
            <p className="mt-1 text-xs text-secondary">{text.length}/500 characters</p>
          </div>

          {/* Author */}
          <div>
            <label
              htmlFor="edit-quote-author"
              className="block text-sm font-medium text-primary mb-2"
            >
              Author <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-quote-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Who said this?"
              required
              maxLength={100}
              className="w-full px-4 py-3 rounded-lg border-2 border-border bg-surface text-primary placeholder:text-secondary focus:border-primary-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="edit-quote-category"
              className="block text-sm font-medium text-primary mb-2"
            >
              Category <span className="text-red-500">*</span>
            </label>
            <Select
              value={category}
              onChange={(value) => setCategory(value as QuoteCategory)}
              options={Object.entries(QUOTE_CATEGORIES).map(([key, label]) => ({
                value: key,
                label: label,
                color: CATEGORY_COLORS[key as QuoteCategory],
              }))}
              aria-label="Quote category"
            />
          </div>

          {/* Source */}
          <div>
            <label
              htmlFor="edit-quote-source"
              className="block text-sm font-medium text-primary mb-2"
            >
              Source (Optional)
            </label>
            <input
              id="edit-quote-source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Book, URL, or reference"
              maxLength={200}
              className="w-full px-4 py-3 rounded-lg border-2 border-border bg-surface text-primary placeholder:text-secondary focus:border-primary-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="edit-quote-notes"
              className="block text-sm font-medium text-primary mb-2"
            >
              Personal Notes (Optional)
            </label>
            <textarea
              id="edit-quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this quote meaningful to you?"
              rows={3}
              maxLength={300}
              className="w-full px-4 py-3 rounded-lg border-2 border-border bg-surface text-primary placeholder:text-secondary focus:border-primary-500 focus:outline-none transition-colors resize-none"
            />
            <p className="mt-1 text-xs text-secondary">{notes.length}/300 characters</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-surface-variant text-primary rounded-lg hover:bg-border transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || !author.trim() || isSubmitting}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface QuoteCardProps {
  quote: Quote;
  onEdit: (quote: Quote) => void;
  onDelete: (quoteId: string) => void;
  onToggleFavorite: (quoteId: string) => void;
  onToggleHidden: (quoteId: string) => void;
}

const QuoteCard: React.FC<QuoteCardProps> = ({
  quote,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleHidden,
}) => {
  const categoryColor = CATEGORY_COLORS[quote.category];
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div
      className={cn(
        'bg-surface rounded-xl shadow-md hover:shadow-lg transition-all p-6 border-2 border-transparent hover:border-border relative',
        quote.isHidden && 'opacity-60'
      )}
    >
      {/* Category Badge */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: categoryColor }}
        >
          {QUOTE_CATEGORIES[quote.category]}
        </span>

        {/* Custom Badge */}
        {quote.isCustom && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-600/20 text-primary-600">
            Custom
          </span>
        )}
      </div>

      {/* Quote Text */}
      <blockquote className="mb-4">
        <p className="text-lg font-light text-primary leading-relaxed line-clamp-4">
          "{quote.text}"
        </p>
        <footer className="mt-2">
          <cite className="text-sm font-medium text-secondary not-italic">— {quote.author}</cite>
        </footer>
      </blockquote>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-secondary mb-4">
        <span>Views: {quote.viewCount}</span>
        {quote.lastViewed && <span>Last: {new Date(quote.lastViewed).toLocaleDateString()}</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-divider">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(quote.id)}
            className={cn(
              'p-2 rounded-full transition-all hover:scale-110',
              quote.isFavorite
                ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30'
                : 'bg-surface-variant text-secondary hover:bg-border'
            )}
            title={quote.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('w-4 h-4', quote.isFavorite && 'fill-current')} />
          </button>

          <button
            type="button"
            onClick={() => onToggleHidden(quote.id)}
            className={cn(
              'p-2 rounded-full transition-all hover:scale-110',
              quote.isHidden
                ? 'bg-primary-600/20 text-primary-600 hover:bg-primary-600/30'
                : 'bg-surface-variant text-secondary hover:bg-border'
            )}
            title={quote.isHidden ? 'Unhide quote' : 'Hide quote'}
          >
            {quote.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>

        {quote.isCustom && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(quote)}
              className="p-2 rounded-full bg-primary-600/20 text-primary-600 hover:bg-primary-600/30 transition-all hover:scale-110"
              title="Edit quote"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onDelete(quote.id);
                    setShowDeleteConfirm(false);
                  }}
                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2 py-1 text-xs bg-surface-variant text-primary rounded hover:bg-border"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-all hover:scale-110"
                title="Delete quote"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const QuoteManagementPage: React.FC = () => {
  const {
    quotes,
    isLoading,
    error,
    initialize,
    toggleFavorite,
    hideQuote,
    unhideQuote,
    editQuote,
    deleteQuote,
  } = useQuoteStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedCategory, setSelectedCategory] = useState<QuoteCategory | 'all'>('all');
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (quotes.length === 0 && !isLoading) {
      initialize();
    }
  }, [quotes.length, isLoading, initialize]);

  // Filter and search quotes
  const filteredQuotes = useMemo(() => {
    let result = [...quotes];

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
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.viewCount !== b.viewCount) return b.viewCount - a.viewCount;
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      return 0;
    });

    return result;
  }, [quotes, searchQuery, filterType, selectedCategory]);

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-surface shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '';
                }}
                className="p-2 hover:bg-surface-variant rounded-full transition-colors text-primary"
                title="Back to home"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-primary">Quote Management</h1>
                <p className="text-secondary mt-1">
                  Manage your collection of {stats.total} quotes
                </p>
              </div>
            </div>

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

          {/* Add Quote Form */}
          {showAddForm && (
            <div className="bg-surface-variant rounded-xl p-6 mb-6 border-2 border-border">
              <AddQuoteForm onSuccess={() => setShowAddForm(false)} />
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
      </div>

      {/* Quote Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingQuote && (
        <EditQuoteModal
          quote={editingQuote}
          onClose={() => setEditingQuote(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};
