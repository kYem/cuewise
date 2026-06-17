import { type ConceptCard, logger } from '@cuewise/shared';
import { Input, Label, Textarea } from '@cuewise/ui';
import { CalendarClock } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';

interface ConceptFormProps {
  /** When provided, the form edits this card instead of adding a new one. */
  card?: ConceptCard;
  onSuccess: () => void;
  onCancel: () => void;
}

function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export const ConceptForm: React.FC<ConceptFormProps> = ({ card, onSuccess, onCancel }) => {
  const [term, setTerm] = useState(card?.term ?? '');
  const [definition, setDefinition] = useState(card?.definition ?? '');
  const [details, setDetails] = useState(card?.details ?? '');
  const [tags, setTags] = useState(card?.tags?.join(', ') ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCard = useConceptCardsStore((state) => state.addCard);
  const updateCard = useConceptCardsStore((state) => state.updateCard);

  const isEdit = card !== undefined;
  const canSave = term.trim().length > 0 && definition.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedTags = parseTags(tags);
      let ok: boolean;
      if (card) {
        // Pass explicit values so cleared fields actually clear on save.
        ok = await updateCard(card.id, { term, definition, details, tags: parsedTags });
      } else {
        ok = await addCard(term, definition, {
          details: details.trim() || undefined,
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        });
      }
      if (ok) {
        onSuccess();
      }
    } catch (error) {
      logger.error('Failed to save concept', error);
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
        {isEdit ? (
          <span />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
            <CalendarClock className="h-3.5 w-3.5" /> First review: today
          </span>
        )}
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
            {isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Save concept'}
          </button>
        </div>
      </div>
    </form>
  );
};
