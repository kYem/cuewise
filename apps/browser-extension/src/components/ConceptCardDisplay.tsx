import {
  CONCEPT_GRADES,
  CONCEPT_INTERVAL_MAX,
  type ConceptCard,
  type ConceptGrade,
  conceptIntervalLabel,
  projectConceptInterval,
} from '@cuewise/shared';
import { BookOpen, Brain, ChevronRight, Eye, Plus, Repeat } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

// Grade accent colors, all theme tokens: error (red), success (green), brand violet.
const GRADE_COLOR: Record<ConceptGrade, string> = {
  again: 'var(--color-error)',
  good: 'var(--color-success)',
  easy: 'var(--color-primary-600)',
};

interface ConceptCardDisplayProps {
  card: ConceptCard;
  activeRecall: boolean;
  onGrade: (grade: ConceptGrade) => void;
  onSkip?: () => void;
  onAdd?: () => void;
  queueLabel?: string;
}

export const ConceptCardDisplay: React.FC<ConceptCardDisplayProps> = ({
  card,
  activeRecall,
  onGrade,
  onSkip,
  onAdd,
  queueLabel,
}) => {
  // Active recall hides the definition until "Reveal"; passive mode shows it
  // upfront. The parent keys this component by card id, so state resets per card.
  const [revealed, setRevealed] = useState(!activeRecall);

  const topic = card.tags?.[0];

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

      {!revealed ? (
        <div>
          <p className="mx-auto mt-4 mb-6 max-w-[44ch] text-[clamp(14px,1.5vw,16px)] leading-relaxed text-secondary">
            Bring the definition to mind — then check how close you were.
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-surface/80 px-6 text-base font-semibold text-primary shadow-md backdrop-blur-sm transition-all hover:bg-surface-variant hover:shadow-lg"
          >
            <Eye className="h-[18px] w-[18px]" /> Reveal answer
          </button>
        </div>
      ) : (
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

          {/* the grading moment */}
          <div className="mt-6">
            <div className="mb-3 text-xs text-secondary">How well did you recall it?</div>
            <div className="flex items-stretch justify-center gap-2.5">
              {CONCEPT_GRADES.map((grade) => {
                // Cap the preview at the same ceiling reviewConceptCard applies.
                const nextInterval = Math.min(
                  projectConceptInterval(card.schedule, grade.id),
                  CONCEPT_INTERVAL_MAX
                );
                return (
                  <button
                    key={grade.id}
                    type="button"
                    title={grade.hint}
                    onClick={() => onGrade(grade.id)}
                    style={{ borderColor: GRADE_COLOR[grade.id] }}
                    className="flex max-w-[150px] flex-1 flex-col items-center gap-0.5 rounded-lg border bg-surface/60 px-2 py-2.5 text-primary backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-surface-variant"
                  >
                    <span className="text-[15px] font-bold">{grade.label}</span>
                    <span className="text-[11px] tabular-nums text-secondary">
                      {conceptIntervalLabel(nextInterval)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* meta row */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3.5 text-xs text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5" /> {card.schedule.repetitions} reviews
          {card.schedule.lapses > 0
            ? ` · ${card.schedule.lapses} lapse${card.schedule.lapses > 1 ? 's' : ''}`
            : ''}
        </span>
        {!revealed && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1 text-tertiary transition-colors hover:text-primary"
          >
            <ChevronRight className="h-3.5 w-3.5" /> Skip
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-tertiary transition-colors hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Add concept
          </button>
        )}
      </div>
    </div>
  );
};
