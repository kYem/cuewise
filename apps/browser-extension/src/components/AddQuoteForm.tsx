import { QUOTE_CATEGORIES, type QuoteCategory } from '@cuewise/shared';
import type React from 'react';
import { useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';

interface AddQuoteFormProps {
  onSuccess: () => void;
}

export const AddQuoteForm: React.FC<AddQuoteFormProps> = ({ onSuccess }) => {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState<QuoteCategory>('inspiration');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCustomQuote = useQuoteStore((state) => state.addCustomQuote);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim() || !author.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await addCustomQuote(
        text.trim(),
        author.trim(),
        category,
        source.trim() || undefined,
        notes.trim() || undefined
      );

      // Reset form
      setText('');
      setAuthor('');
      setCategory('inspiration');
      setSource('');
      setNotes('');

      onSuccess();
    } catch (error) {
      console.error('Failed to add quote:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Quote Text */}
      <div>
        <label htmlFor="quote-text" className="block text-sm font-medium text-gray-700 mb-2">
          Quote Text <span className="text-red-500">*</span>
        </label>
        <textarea
          id="quote-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter the quote..."
          required
          rows={4}
          maxLength={500}
          className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors resize-none"
        />
        <p className="mt-1 text-xs text-gray-500">{text.length}/500 characters</p>
      </div>

      {/* Author */}
      <div>
        <label htmlFor="quote-author" className="block text-sm font-medium text-gray-700 mb-2">
          Author <span className="text-red-500">*</span>
        </label>
        <input
          id="quote-author"
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Who said this?"
          required
          maxLength={100}
          className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
        />
      </div>

      {/* Category */}
      <div>
        <label htmlFor="quote-category" className="block text-sm font-medium text-gray-700 mb-2">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          id="quote-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as QuoteCategory)}
          className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
        >
          {Object.entries(QUOTE_CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Source (Optional) */}
      <div>
        <label htmlFor="quote-source" className="block text-sm font-medium text-gray-700 mb-2">
          Source (Optional)
        </label>
        <input
          id="quote-source"
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Book, URL, or reference (e.g., 'The Art of War')"
          maxLength={200}
          className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
        />
        <p className="mt-1 text-xs text-gray-500">
          Where did you find this quote? (book title, website, etc.)
        </p>
      </div>

      {/* Notes (Optional) */}
      <div>
        <label htmlFor="quote-notes" className="block text-sm font-medium text-gray-700 mb-2">
          Personal Notes (Optional)
        </label>
        <textarea
          id="quote-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why is this quote meaningful to you?"
          rows={3}
          maxLength={300}
          className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors resize-none"
        />
        <p className="mt-1 text-xs text-gray-500">{notes.length}/300 characters</p>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="submit"
          disabled={!text.trim() || !author.trim() || isSubmitting}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
        >
          {isSubmitting ? 'Adding...' : 'Add Quote'}
        </button>
      </div>
    </form>
  );
};
