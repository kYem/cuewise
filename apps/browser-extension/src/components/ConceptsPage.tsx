import {
  type ConceptCard,
  type ConceptDifficulty,
  getConceptDifficulty,
  getTodayDateString,
} from '@cuewise/shared';
import { cn, Input } from '@cuewise/ui';
import { ArrowLeft, Brain, Pencil, Plus, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptForm } from './ConceptForm';
import { Modal } from './Modal';

const DIFFICULTY_ACCENT: Record<ConceptDifficulty, string> = {
  new: '',
  struggling: 'border-l-4 border-l-error',
  solid: 'border-l-4 border-l-warning',
  strong: 'border-l-4 border-l-success',
};

export const ConceptsPage: React.FC = () => {
  const cards = useConceptCardsStore((state) => state.cards);
  const isLoading = useConceptCardsStore((state) => state.isLoading);
  const initialize = useConceptCardsStore((state) => state.initialize);
  const deleteCard = useConceptCardsStore((state) => state.deleteCard);

  const [isAdding, setIsAdding] = useState(false);
  const [editingCard, setEditingCard] = useState<ConceptCard | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const today = getTodayDateString();
  const dueCount = cards.filter((card) => card.schedule.dueDate <= today).length;

  const allTags = useMemo(
    () => [...new Set(cards.flatMap((card) => card.tags ?? []))].sort(),
    [cards]
  );
  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        card.term.toLowerCase().includes(normalizedQuery) ||
        card.definition.toLowerCase().includes(normalizedQuery) ||
        (card.source ?? '').toLowerCase().includes(normalizedQuery) ||
        (card.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedQuery));
      const matchesTag = activeTag === null || (card.tags ?? []).includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [cards, query, activeTag]);

  // Two-click delete: first click arms, second confirms.
  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteCard(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  return (
    <div className="min-h-full text-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                window.location.hash = '';
              }}
              className="p-2 rounded-full text-secondary hover:text-primary hover:bg-surface-variant transition-colors"
              title="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary-600" />
              <div>
                <h1 className="text-lg font-bold">Concepts</h1>
                <p className="text-xs text-secondary">
                  {cards.length} {cards.length === 1 ? 'card' : 'cards'} · {dueCount} due
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add concept
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? null : cards.length === 0 ? (
          <div className="text-center py-20">
            <Brain className="w-12 h-12 text-primary-600 mx-auto mb-4 opacity-70" />
            <h2 className="text-xl font-semibold mb-2">No concepts yet</h2>
            <p className="text-secondary mb-6 max-w-sm mx-auto">
              Save a term and its definition — Cuewise resurfaces it on a spaced schedule so it
              actually sticks.
            </p>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add your first concept
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search concepts…"
                aria-label="Search concepts"
              />
              {allTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag((current) => (current === tag ? null : tag))}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full transition-colors',
                        activeTag === tag
                          ? 'bg-primary-600 text-white'
                          : 'bg-surface-variant text-secondary hover:text-primary'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {filteredCards.length === 0 ? (
              <div className="text-center py-12 text-secondary">No concepts match your search.</div>
            ) : (
              <ul className="space-y-3">
                {filteredCards.map((card) => {
                  const due = card.schedule.dueDate <= today;
                  return (
                    <li
                      key={card.id}
                      className={cn(
                        'rounded-xl border border-border bg-surface p-4',
                        DIFFICULTY_ACCENT[getConceptDifficulty(card)]
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-primary">{card.term}</h3>
                            <span
                              className={cn(
                                'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                                due
                                  ? 'bg-primary-600/15 text-primary-600'
                                  : 'bg-surface-variant text-secondary'
                              )}
                            >
                              {due ? 'Due now' : `Due ${card.schedule.dueDate}`}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-secondary line-clamp-2">
                            {card.definition}
                          </p>
                          {card.tags?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {card.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-surface-variant text-secondary"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-2 text-xs text-tertiary">
                            {card.schedule.repetitions} reviews · interval {card.schedule.interval}d
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-none">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setEditingCard(card);
                            }}
                            className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-variant transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(card.id)}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              confirmDeleteId === card.id
                                ? 'bg-surface-variant text-error'
                                : 'text-secondary hover:text-error hover:bg-surface-variant'
                            )}
                            title={confirmDeleteId === card.id ? 'Click again to delete' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="Add a concept" size="md">
        <ConceptForm onSuccess={() => setIsAdding(false)} onCancel={() => setIsAdding(false)} />
      </Modal>
      <Modal
        isOpen={editingCard !== null}
        onClose={() => setEditingCard(null)}
        title="Edit concept"
        size="md"
      >
        {editingCard && (
          <ConceptForm
            key={editingCard.id}
            card={editingCard}
            onSuccess={() => setEditingCard(null)}
            onCancel={() => setEditingCard(null)}
          />
        )}
      </Modal>
    </div>
  );
};
