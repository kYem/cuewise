import type { QuoteCollection } from '@cuewise/shared';
import { X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';

interface CollectionFormProps {
  collection?: QuoteCollection;
  onClose: () => void;
}

export const CollectionForm: React.FC<CollectionFormProps> = ({ collection, onClose }) => {
  const { createCollection, updateCollection } = useQuoteStore();

  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!collection;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Collection name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let success: boolean;

      if (isEditing) {
        success = await updateCollection(collection.id, {
          name: trimmedName,
          description: description.trim() || undefined,
        });
      } else {
        success = await createCollection(trimmedName, description.trim() || undefined);
      }

      if (success) {
        onClose();
      } else {
        setError('Failed to save collection. Please try again.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-primary">
          {isEditing ? 'Edit Collection' : 'Create Collection'}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-secondary hover:text-primary rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="collection-name" className="block text-sm font-medium text-primary mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="collection-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Morning Motivation"
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none transition-colors"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label
          htmlFor="collection-description"
          className="block text-sm font-medium text-primary mb-1"
        >
          Description <span className="text-tertiary">(optional)</span>
        </label>
        <textarea
          id="collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of this collection..."
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none transition-colors resize-none"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-secondary hover:text-primary transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Collection'}
        </button>
      </div>
    </form>
  );
};
