import { type ConceptSchedule, getTodayDateString } from '@cuewise/shared';
import { Brain, CalendarClock, Eye, RotateCcw } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface ConceptFormPreviewProps {
  term: string;
  definition: string;
  /** The card's category dot — its first tag, mirroring the live card. */
  category?: string;
  tags: string[];
  mode: 'add' | 'edit';
  /** Present in edit mode: the card's current review schedule. */
  schedule?: ConceptSchedule;
}

/** Live preview of how the card will surface in the rotation (term → reveal). */
export const ConceptFormPreview: React.FC<ConceptFormPreviewProps> = ({
  term,
  definition,
  category,
  tags,
  mode,
  schedule,
}) => {
  const [revealed, setRevealed] = useState(false);
  const due = schedule ? schedule.dueDate <= getTodayDateString() : false;

  return (
    <div className="flex flex-col gap-3.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-tertiary">Preview</span>

      <div className="overflow-hidden rounded-xl border border-border shadow-lg">
        {/* faux photo backdrop so the glass card reads true */}
        <div
          className="min-h-[150px] p-5"
          style={{ background: 'linear-gradient(135deg, #2f4439, #1b2b33 60%, #232036)' }}
        >
          <div className="mb-3 inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#d6c8ff]">
              <Brain className="h-2.5 w-2.5" /> Recall
            </span>
            {category && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-600" /> {category}
              </span>
            )}
          </div>

          <div className="font-display text-xl font-semibold leading-tight text-white">
            {term.trim() || 'Your term'}
          </div>

          {revealed ? (
            <div className="mt-2.5">
              {definition.trim() ? (
                <p className="text-[13px] leading-relaxed text-white/80">{definition.trim()}</p>
              ) : (
                <p className="text-[13px] italic leading-relaxed text-white/40">
                  Your definition appears here.
                </p>
              )}
              {tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setRevealed(false)}
                className="mt-2.5 inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Hide
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white hover:bg-white/25"
            >
              <Eye className="h-3 w-3" /> Reveal answer
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-variant px-3.5 py-3">
        <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <CalendarClock className="h-3 w-3 text-primary-600" /> Review schedule
        </div>
        {mode === 'edit' && schedule ? (
          <div className="flex flex-col gap-1.5 text-xs text-secondary">
            <span className="flex justify-between">
              <span>Reviews</span>
              <span className="text-primary tabular-nums">{schedule.repetitions}</span>
            </span>
            <span className="flex justify-between">
              <span>Current interval</span>
              <span className="text-primary">{schedule.interval}d</span>
            </span>
            <span className="flex justify-between">
              <span>Next review</span>
              <span className={due ? 'text-success' : 'text-primary'}>
                {due ? 'Due today' : `in ${schedule.interval}d`}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-secondary">
            First review is <strong className="font-semibold text-primary">today</strong>. Recall it
            well and Cuewise spaces the next ones further out — a day, then a week, then beyond.
          </p>
        )}
      </div>
    </div>
  );
};
