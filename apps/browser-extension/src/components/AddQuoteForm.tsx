import { logger, QUOTE_CATEGORIES, type QuoteCategory } from '@cuewise/shared';
import { Input, Label, Textarea } from '@cuewise/ui';
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
      logger.error('Failed to add quote', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Quote Text */}
      <div>
        <Label htmlFor="quote-text" required>
          Quote Text
        </Label>
        <Textarea
          id="quote-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter the quote..."
          required
          rows={4}
          maxLength={500}
          showCount
        />
      </div>

      {/* Author */}
      <div>
        <Label htmlFor="quote-author" required>
          Author
        </Label>
        <Input
          id="quote-author"
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Who said this?"
          required
          maxLength={100}
        />
      </div>

      {/* Category */}
      <div>
        <Label htmlFor="quote-category" required>
          Category
        </Label>
        <select
          id="quote-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as QuoteCategory)}
          className="w-full px-4 py-3 rounded-lg border-2 border-border text-primary focus:border-primary-500 focus:outline-none transition-colors"
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
        <Label htmlFor="quote-source">Source (Optional)</Label>
        <Input
          id="quote-source"
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Book, URL, or reference (e.g., 'The Art of War')"
          maxLength={200}
        />
        <p className="mt-1 text-xs text-secondary">
          Where did you find this quote? (book title, website, etc.)
        </p>
      </div>

      {/* Notes (Optional) */}
      <div>
        <Label htmlFor="quote-notes">Personal Notes (Optional)</Label>
        <Textarea
          id="quote-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why is this quote meaningful to you?"
          rows={3}
          maxLength={300}
          showCount
        />
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
