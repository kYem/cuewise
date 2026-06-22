import { type ConceptCard, getTodayDateString, logger } from '@cuewise/shared';
import { Input, Label, Textarea } from '@cuewise/ui';
import { Trash2 } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptFormPreview } from './ConceptFormPreview';
import { ConceptSourceInput } from './ConceptSourceInput';
import { ConceptTagInput } from './ConceptTagInput';

interface ConceptFormProps {
  /** When provided, the form edits this card instead of adding a new one. */
  card?: ConceptCard;
  onSuccess: () => void;
  onCancel: () => void;
}

const DEF_MAX = 600;

export const ConceptForm: React.FC<ConceptFormProps> = ({ card, onSuccess, onCancel }) => {
  const [term, setTerm] = useState(card?.term ?? '');
  const [definition, setDefinition] = useState(card?.definition ?? '');
  const [details, setDetails] = useState(card?.details ?? '');
  const [tags, setTags] = useState<string[]>(card?.tags ?? []);
  const [source, setSource] = useState(card?.source ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const cards = useConceptCardsStore((state) => state.cards);
  const addCard = useConceptCardsStore((state) => state.addCard);
  const updateCard = useConceptCardsStore((state) => state.updateCard);
  const deleteCard = useConceptCardsStore((state) => state.deleteCard);

  // Suggestions drawn from the rest of the deck so tags/sources stay consistent.
  const existingTags = useMemo(
    () => [...new Set(cards.flatMap((c) => c.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    [cards]
  );
  const existingSources = useMemo(
    () =>
      [...new Set(cards.map((c) => c.source).filter((s): s is string => Boolean(s)))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [cards]
  );

  const isEdit = card !== undefined;
  const canSave = term.trim().length > 0 && definition.trim().length > 0;
  const schedule = card
    ? {
        repetitions: card.schedule.repetitions,
        interval: card.schedule.interval,
        due: card.schedule.dueDate <= getTodayDateString(),
      }
    : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      let ok: boolean;
      if (card) {
        // Pass explicit values so cleared fields actually clear on save.
        ok = await updateCard(card.id, { term, definition, details, tags, source });
      } else {
        ok = await addCard(term, definition, {
          details: details.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
          source: source.trim() || undefined,
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

  const handleDelete = async () => {
    if (!card) {
      return;
    }
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const ok = await deleteCard(card.id);
    if (ok) {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_240px]">
        {/* fields */}
        <div className="space-y-4">
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
              maxLength={DEF_MAX}
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
              maxLength={DEF_MAX}
              showCount
            />
          </div>

          <div>
            <Label htmlFor="concept-tags">Tags (optional)</Label>
            <ConceptTagInput tags={tags} onChange={setTags} suggestions={existingTags} />
          </div>

          <div>
            <Label htmlFor="concept-source">Source (optional)</Label>
            <ConceptSourceInput value={source} onChange={setSource} suggestions={existingSources} />
          </div>
        </div>

        {/* live preview */}
        <ConceptFormPreview
          term={term}
          definition={definition}
          category={tags[0]}
          tags={tags}
          mode={isEdit ? 'edit' : 'add'}
          schedule={schedule}
        />
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-error/40 px-3 py-2.5 font-medium text-error transition-all hover:bg-error/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> {confirmingDelete ? 'Confirm delete' : 'Delete'}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border-2 border-border bg-surface px-5 py-2.5 font-medium text-primary transition-all hover:bg-surface-variant disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave || isSubmitting}
          className="rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save concept'}
        </button>
      </div>
    </form>
  );
};
