import {
  type ConceptCard,
  getTodayDateString,
  matchesSearchQuery,
  uniqueSorted,
} from '@cuewise/shared';
import { ArrowLeft, Brain, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptCardRow } from './ConceptCardRow';
import { ConceptDeckToolbar } from './ConceptDeckToolbar';
import { ConceptForm } from './ConceptForm';
import { Modal } from './Modal';

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

  const allTags = useMemo(() => uniqueSorted(cards.flatMap((card) => card.tags ?? [])), [cards]);
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesQuery = matchesSearchQuery(
        [card.term, card.definition, card.source, ...(card.tags ?? [])],
        query
      );
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
            <ConceptDeckToolbar
              query={query}
              onQueryChange={setQuery}
              tags={allTags}
              activeTag={activeTag}
              onToggleTag={(tag) => setActiveTag((current) => (current === tag ? null : tag))}
            />
            {filteredCards.length === 0 ? (
              <div className="text-center py-12 text-secondary">No concepts match your search.</div>
            ) : (
              <ul className="space-y-3">
                {filteredCards.map((card) => (
                  <ConceptCardRow
                    key={card.id}
                    card={card}
                    due={card.schedule.dueDate <= today}
                    isConfirmingDelete={confirmDeleteId === card.id}
                    onEdit={() => {
                      setConfirmDeleteId(null);
                      setEditingCard(card);
                    }}
                    onDelete={() => handleDelete(card.id)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="Add a concept" size="2xl">
        <ConceptForm onSuccess={() => setIsAdding(false)} onCancel={() => setIsAdding(false)} />
      </Modal>
      <Modal
        isOpen={editingCard !== null}
        onClose={() => setEditingCard(null)}
        title="Edit concept"
        size="2xl"
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
