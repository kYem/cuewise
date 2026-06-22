import {
  CONCEPT_GRADES,
  CONCEPT_INTERVAL_MAX,
  type ConceptCard,
  type ConceptGrade,
  conceptIntervalLabel,
  projectConceptInterval,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { BookOpen, Brain, CornerRightDown } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ConceptToolbar } from './ConceptToolbar';

// Per-grade accent (theme tokens: error / success / brand violet) — a soft
// tinted border + faint hover fill, kept light to suit the calm glass surface.
const GRADE_ACCENT: Record<ConceptGrade, string> = {
  again: 'border-error/50 hover:bg-error/10',
  good: 'border-success/50 hover:bg-success/10',
  easy: 'border-primary-600/50 hover:bg-primary-600/10',
};

interface ConceptCardDisplayProps {
  card: ConceptCard;
  activeRecall: boolean;
  onGrade: (grade: ConceptGrade) => void;
  onPrev: () => void;
  onNext: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Cards due now, for the toolbar's filter badge. */
  dueCount: number;
  onAdd?: () => void;
  queueLabel?: string;
}

export const ConceptCardDisplay: React.FC<ConceptCardDisplayProps> = ({
  card,
  activeRecall,
  onGrade,
  onPrev,
  onNext,
  isFavorite,
  onToggleFavorite,
  dueCount,
  onAdd,
  queueLabel,
}) => {
  // Active recall hides the definition until "Reveal"; passive mode shows it
  // upfront. The parent keys this component by card id, so state resets per card.
  const [revealed, setRevealed] = useState(!activeRecall);

  const topic = card.tags?.[0];

  // Anki-style 1/2/3 grading, live only once the answer is revealed. Ignores
  // modifier combos and keystrokes aimed at a text field.
  useEffect(() => {
    if (!revealed) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      const index = ['1', '2', '3'].indexOf(e.key);
      if (index === -1 || index >= CONCEPT_GRADES.length) {
        return;
      }
      e.preventDefault();
      onGrade(CONCEPT_GRADES[index].id);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [revealed, onGrade]);

  return (
    <div className="w-full max-w-2xl mx-auto text-center text-primary">
      {/* eyebrow: Recall pill + optional topic */}
      <div className="flex items-center justify-center gap-3 mb-5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-600">
          <Brain className="h-3.5 w-3.5" /> Recall
        </span>
        {topic && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-600" />
            {topic}
          </span>
        )}
        {queueLabel && <span className="text-xs text-tertiary">· {queueLabel}</span>}
      </div>

      {/* term — the prompt */}
      <h2 className="font-display font-semibold tracking-tight text-[clamp(28px,4vw,46px)] leading-tight m-0">
        {card.term}
      </h2>

      {revealed ? (
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 mx-auto mt-5 max-w-[640px] rounded-2xl border border-border bg-surface-elevated/70 px-6 py-5 shadow-xl backdrop-blur-md duration-300">
          <p className="mx-auto max-w-[50ch] font-display text-[clamp(17px,1.9vw,21px)] font-medium leading-relaxed text-primary">
            {card.definition}
          </p>

          {card.details && (
            <div className="mx-auto mt-5 max-w-[52ch]">
              <div className="my-2.5 flex items-center justify-center gap-2.5">
                <span className="h-px w-7 bg-border" />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tertiary">
                  How it works
                </span>
                <span className="h-px w-7 bg-border" />
              </div>
              <p className="m-0 text-sm leading-relaxed text-secondary">{card.details}</p>
            </div>
          )}

          {(card.tags?.length || card.source) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              {card.tags?.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-surface-variant px-2.5 py-0.5 text-[11px] font-semibold text-secondary"
                >
                  {tag}
                </span>
              ))}
              {card.source && (
                <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-tertiary">
                  <BookOpen className="h-3 w-3" /> {card.source}
                </span>
              )}
            </div>
          )}

          {/* the grading moment — one compact row: prompt, then inline pills */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-secondary">How well did you recall it?</span>
            <div className="flex flex-wrap items-center gap-2">
              {CONCEPT_GRADES.map((grade, i) => {
                // Cap the preview at the same ceiling reviewConceptCard applies.
                const nextInterval = Math.min(
                  projectConceptInterval(card.schedule, grade.id),
                  CONCEPT_INTERVAL_MAX
                );
                return (
                  <button
                    key={grade.id}
                    type="button"
                    title={`${grade.hint} (press ${i + 1})`}
                    onClick={() => onGrade(grade.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border bg-surface/60 px-3 py-1 backdrop-blur-sm transition-all hover:-translate-y-0.5',
                      GRADE_ACCENT[grade.id]
                    )}
                  >
                    <span className="text-[13px] font-semibold text-primary">{grade.label}</span>
                    <span className="text-[11px] tabular-nums text-tertiary">
                      {conceptIntervalLabel(nextInterval)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 inline-flex items-center gap-2 text-[clamp(13px,1.4vw,15px)] text-secondary">
          Bring it to mind, then reveal
          <CornerRightDown className="h-3.5 w-3.5 text-tertiary" />
        </div>
      )}

      <ConceptToolbar
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onPrev={onPrev}
        onNext={onNext}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        dueCount={dueCount}
        onAdd={onAdd}
      />
    </div>
  );
};
