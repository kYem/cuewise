import { CONCEPT_TEMPLATES, type ConceptTemplate } from '@cuewise/shared';
import {
  Brain,
  BrainCog,
  Code2,
  Layers,
  LineChart,
  PiggyBank,
  Sparkles,
  Timer,
} from 'lucide-react';
import type React from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useToastStore } from '../stores/toast-store';

// Per-pack icon; falls back to a generic mark for any future pack.
const TEMPLATE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  'system-design': Layers,
  javascript: Code2,
  'cognitive-biases': BrainCog,
  productivity: Timer,
  statistics: LineChart,
  'personal-finance': PiggyBank,
};

interface ConceptTemplateGridProps {
  /** Called after a pack is added so the caller can close the picker. */
  onAdded?: () => void;
}

export const ConceptTemplateGrid: React.FC<ConceptTemplateGridProps> = ({ onAdded }) => {
  const cards = useConceptCardsStore((state) => state.cards);
  const addCards = useConceptCardsStore((state) => state.addCards);

  // Terms already in the deck, so a pack can show how much of it is new.
  const existingTerms = new Set(cards.map((card) => card.term.trim().toLowerCase()));

  const remainingInPack = (template: ConceptTemplate): number =>
    template.cards.filter((card) => !existingTerms.has(card.term.trim().toLowerCase())).length;

  const handleAdd = async (template: ConceptTemplate) => {
    const added = await addCards(
      template.cards.map((card) => ({
        term: card.term,
        definition: card.definition,
        extras: { details: card.details, tags: [template.tag] },
      }))
    );

    if (added === 0) {
      useToastStore.getState().warning(`All of “${template.name}” is already in your deck.`);
      return;
    }
    if (added < template.cards.length) {
      useToastStore.getState().success(`Added ${added} new concepts from “${template.name}”.`);
    } else {
      useToastStore.getState().success(`Added ${added} concepts from “${template.name}”.`);
    }
    if (onAdded) {
      onAdded();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary">
        Seed your deck with a curated pack of common terms. Each card is due right away and joins
        your spaced-review rotation — edit or delete any of them later.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CONCEPT_TEMPLATES.map((template) => {
          let Icon = TEMPLATE_ICONS[template.id];
          if (!Icon) {
            Icon = Brain;
          }
          const remaining = remainingInPack(template);
          const fullyAdded = remaining === 0;

          return (
            <div
              key={template.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary-100 p-2 dark:bg-primary-900/30">
                  <Icon className="h-5 w-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-primary">{template.name}</div>
                  <p className="mt-0.5 text-xs text-secondary">{template.description}</p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-3">
                <span className="text-xs text-secondary">
                  {template.cards.length} cards
                  {!fullyAdded && remaining < template.cards.length ? ` · ${remaining} new` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => handleAdd(template)}
                  disabled={fullyAdded}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {fullyAdded
                    ? 'Added'
                    : remaining < template.cards.length
                      ? 'Add new'
                      : 'Add pack'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
