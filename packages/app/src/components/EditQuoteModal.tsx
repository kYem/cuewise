import {
  CATEGORY_COLORS,
  logger,
  QUOTE_CATEGORIES,
  type Quote,
  type QuoteCategory,
} from '@cuewise/shared';
import { Autocomplete, Select } from '@cuewise/ui';
import { X } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { useToastStore } from '../stores/toast-store';

export interface EditQuoteModalProps {
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

export const EditQuoteModal: React.FC<EditQuoteModalProps> = ({ quote, onClose, onSave }) => {
  const [text, setText] = useState(quote.text);
  const [author, setAuthor] = useState(quote.author);
  const [category, setCategory] = useState<QuoteCategory>(quote.category);
  const [source, setSource] = useState(quote.source || '');
  const [notes, setNotes] = useState(quote.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quotes = useQuoteStore((state) => state.quotes);

  // Get unique authors sorted alphabetically
  const existingAuthors = useMemo(() => {
    const authors = new Set(quotes.map((q) => q.author));
    return Array.from(authors).sort((a, b) => a.localeCompare(b));
  }, [quotes]);

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
      logger.error('Failed to save quote', error);
      useToastStore.getState().error('Failed to save changes. Please try again.');
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
            <Autocomplete
              id="edit-quote-author"
              value={author}
              onChange={setAuthor}
              suggestions={existingAuthors}
              placeholder="Who said this?"
              required
              maxLength={100}
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
