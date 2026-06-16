import { logger } from '@cuewise/shared';
import { Input, Label, Textarea } from '@cuewise/ui';
import { CalendarClock } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';

interface AddConceptFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function parseTags(input: string): string[] | undefined {
  const tags = input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
}

export const AddConceptForm: React.FC<AddConceptFormProps> = ({ onSuccess, onCancel }) => {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [details, setDetails] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCard = useConceptCardsStore((state) => state.addCard);

  const canSave = term.trim().length > 0 && definition.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await addCard(term, definition, {
        details: details.trim() || undefined,
        tags: parseTags(tags),
      });
      if (ok) {
        onSuccess();
      }
    } catch (error) {
      logger.error('Failed to add concept', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="concept-term" required>
          Term
        </Label>
        <Input
          id="concept-term"
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="e.g. Saga pattern"
          maxLength={120}
          autoFocus
        />
      </div>

      <div>
        <Label htmlFor="concept-definition" required>
          Definition
        </Label>
        <Textarea
          id="concept-definition"
          value={definition}
          onChange={(e) => setDefinition(e.target.value)}
          placeholder="In one or two sentences, what is it?"
          rows={3}
          maxLength={600}
          showCount
        />
      </div>

      <div>
        <Label htmlFor="concept-details">How it works (optional)</Label>
        <Textarea
          id="concept-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="An example or mechanism that makes it click."
          rows={2}
          maxLength={600}
          showCount
        />
      </div>

      <div>
        <Label htmlFor="concept-tags">Tags (optional)</Label>
        <Input
          id="concept-tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma-separated, e.g. microservices, consistency"
          maxLength={120}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
          <CalendarClock className="h-3.5 w-3.5" /> First review: today
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-surface text-primary border-2 border-border rounded-lg hover:bg-surface-variant disabled:opacity-50 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave || isSubmitting}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
          >
            {isSubmitting ? 'Saving...' : 'Save concept'}
          </button>
        </div>
      </div>
    </form>
  );
};
