import { addDays, format } from 'date-fns';
import { CONCEPT_EASE_DEFAULT, CONCEPT_EASE_MIN, CONCEPT_INTERVAL_MAX } from './constants';
import type { ConceptCard, ConceptGrade, ConceptSchedule } from './types';

/**
 * Spaced repetition for concept cards — a simplified SM-2 with three grades.
 * `again` relearns soon and eases down; `good` walks 1d → 6d → interval×ease;
 * `easy` jumps further and eases up. All functions are pure: callers pass
 * `today` (no Date.now) so the schedule is deterministic and testable.
 */

// Grade metadata for the recall UI (Again / Good / Easy). Colors are applied in
// the component from theme tokens, so this stays DOM-free.
export const CONCEPT_GRADES: { id: ConceptGrade; label: string; hint: string }[] = [
  { id: 'again', label: 'Again', hint: 'Forgot' },
  { id: 'good', label: 'Good', hint: 'Recalled' },
  { id: 'easy', label: 'Easy', hint: 'Knew it' },
];

/** Initial review schedule for a brand-new card — due immediately. */
export function newConceptSchedule(today: Date): ConceptSchedule {
  return {
    dueDate: format(today, 'yyyy-MM-dd'),
    interval: 0,
    easeFactor: CONCEPT_EASE_DEFAULT,
    repetitions: 0,
    lapses: 0,
  };
}

/** Next interval in days for a grade (0 = relearn today). Pure projection. */
export function projectConceptInterval(schedule: ConceptSchedule, grade: ConceptGrade): number {
  const ease = schedule.easeFactor || CONCEPT_EASE_DEFAULT;
  const reps = schedule.repetitions || 0;
  const iv = schedule.interval || 0;

  if (grade === 'again') {
    return 0;
  }
  if (grade === 'good') {
    if (reps === 0) {
      return 1;
    }
    if (reps === 1) {
      return 6;
    }
    return Math.max(1, Math.round(iv * ease));
  }
  // easy
  if (reps === 0) {
    return 4;
  }
  return Math.max(4, Math.round((iv || 1) * ease * 1.3));
}

/** Friendly relative-time label for a day-count interval (e.g. "6d", "2w"). */
export function conceptIntervalLabel(days: number): string {
  if (days <= 0) {
    return '<10m';
  }
  if (days === 1) {
    return '1d';
  }
  if (days < 7) {
    return `${days}d`;
  }
  if (days < 30) {
    return `${Math.round(days / 7)}w`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)}mo`;
  }
  return `${Math.round(days / 365)}y`;
}

function nextEaseFactor(ease: number, grade: ConceptGrade): number {
  if (grade === 'again') {
    return Math.max(CONCEPT_EASE_MIN, ease - 0.2);
  }
  if (grade === 'easy') {
    return ease + 0.15;
  }
  return ease;
}

/** Apply a grade: returns the card with its review schedule advanced. Pure. */
export function reviewConceptCard(
  card: ConceptCard,
  grade: ConceptGrade,
  today: Date
): ConceptCard {
  const { schedule } = card;
  const interval = Math.min(projectConceptInterval(schedule, grade), CONCEPT_INTERVAL_MAX);

  return {
    ...card,
    schedule: {
      ...schedule,
      interval,
      dueDate: format(addDays(today, interval), 'yyyy-MM-dd'),
      repetitions: grade === 'again' ? 0 : schedule.repetitions + 1,
      lapses: grade === 'again' ? schedule.lapses + 1 : schedule.lapses,
      easeFactor: nextEaseFactor(schedule.easeFactor, grade),
      lastReviewedAt: today.toISOString(),
    },
  };
}

/**
 * Cards due for review (dueDate ≤ today), ordered for surfacing: most-overdue
 * first, then least-recently-seen, so a just-"again"-graded card sorts behind
 * cards not yet reviewed today.
 */
export function getDueConceptCards(cards: ConceptCard[], today: Date): ConceptCard[] {
  const todayStr = format(today, 'yyyy-MM-dd');
  return cards
    .filter((card) => card.schedule.dueDate <= todayStr)
    .sort((a, b) => {
      if (a.schedule.dueDate !== b.schedule.dueDate) {
        return a.schedule.dueDate < b.schedule.dueDate ? -1 : 1;
      }
      const lastA = a.schedule.lastReviewedAt ?? '';
      const lastB = b.schedule.lastReviewedAt ?? '';
      if (lastA !== lastB) {
        return lastA < lastB ? -1 : 1;
      }
      return a.createdAt < b.createdAt ? -1 : 1;
    });
}
