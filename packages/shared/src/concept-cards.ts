import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import {
  CONCEPT_EASE_DEFAULT,
  CONCEPT_EASE_MIN,
  CONCEPT_INTERVAL_MAX,
  CONCEPT_NUDGE_AFTER_QUOTE_VIEWS,
  CONCEPT_NUDGE_GAP_DAYS,
  CONCEPT_NUDGE_MAX_SHOWS,
} from './constants';
import type { ConceptCard, ConceptGrade, ConceptSchedule, ConceptStats } from './types';
import type { NudgeShowState } from './utils';

/**
 * Spaced repetition for concept cards — a simplified SM-2 with three grades.
 * `again` relearns soon and eases down; `good` walks 1d → 6d → interval×ease;
 * `easy` jumps further and eases up. All functions are pure: callers pass
 * `today` (no Date.now) so the schedule is deterministic and testable.
 */

// Grade metadata for the recall UI (Again / Good / Easy). Colors are applied in
// the component from theme tokens, so this stays DOM-free.
export const CONCEPT_GRADES = [
  { id: 'again', label: 'Again', hint: 'Forgot' },
  { id: 'good', label: 'Good', hint: 'Recalled' },
  { id: 'easy', label: 'Easy', hint: 'Knew it' },
] as const satisfies readonly { id: ConceptGrade; label: string; hint: string }[];

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

  // Exhaustive switch: a future grade becomes a compile error, not silent math.
  switch (grade) {
    case 'again':
      return 0;
    case 'good': {
      if (reps === 0) {
        return 1;
      }
      if (reps === 1) {
        return 6;
      }
      return Math.max(1, Math.round(iv * ease));
    }
    case 'easy': {
      if (reps === 0) {
        return 4;
      }
      return Math.max(4, Math.round((iv || 1) * ease * 1.3));
    }
  }
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
  switch (grade) {
    case 'again':
      return Math.max(CONCEPT_EASE_MIN, ease - 0.2);
    case 'easy':
      return ease + 0.15;
    case 'good':
      return ease;
  }
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

/**
 * Whether to show the one-time discovery nudge. Surfaces only for an engaged
 * user (≥ N quote views) who has no concept cards yet — capped at a couple of
 * shows with a multi-day gap, and never once they've added a card. Pure.
 */
export function shouldShowConceptNudge(params: {
  enabled: boolean;
  conceptCount: number;
  totalQuoteViews: number;
  state: NudgeShowState;
  today: string;
}): boolean {
  const { enabled, conceptCount, totalQuoteViews, state, today } = params;
  if (!enabled || conceptCount > 0 || state.dismissed) {
    return false;
  }
  if (state.count >= CONCEPT_NUDGE_MAX_SHOWS) {
    return false;
  }
  if (totalQuoteViews < CONCEPT_NUDGE_AFTER_QUOTE_VIEWS) {
    return false;
  }
  if (
    state.lastShownAt &&
    differenceInCalendarDays(parseISO(today), parseISO(state.lastShownAt)) < CONCEPT_NUDGE_GAP_DAYS
  ) {
    return false;
  }
  return true;
}

// A reviewed card is "mastered" once its interval reaches the standard
// young→mature boundary (21d); reviewed but below that is still "learning".
const MASTERED_INTERVAL_DAYS = 21;
const FORECAST_DAYS = 7;

/**
 * Aggregate learning stats for a deck, derived purely from each card's current
 * schedule (no review log). `today` is passed in so the result is deterministic.
 */
export function getConceptStats(cards: ConceptCard[], today: Date): ConceptStats {
  // forecastDays[0] is today; the rest are the next 6 calendar days.
  const forecastDays = Array.from({ length: FORECAST_DAYS }, (_, i) =>
    format(addDays(today, i), 'yyyy-MM-dd')
  );
  const todayStr = forecastDays[0];
  const forecastCounts = new Array(FORECAST_DAYS).fill(0);
  let due = 0;
  let newCount = 0;
  let learning = 0;
  let mastered = 0;
  let reviewed = 0;
  let neverLapsed = 0;
  let easeSum = 0;

  for (const concept of cards) {
    const s = concept.schedule;
    // Today's forecast bar carries everything due (incl. overdue), so it
    // reconciles with `due`; later bars are that exact day's cards.
    if (s.dueDate <= todayStr) {
      due += 1;
      forecastCounts[0] += 1;
    } else {
      const dayIndex = forecastDays.indexOf(s.dueDate);
      if (dayIndex > 0) {
        forecastCounts[dayIndex] += 1;
      }
    }
    // A card is "New" only until its first review; an "again" grade resets
    // repetitions to 0 but keeps lastReviewedAt, so a lapsed card is "Learning".
    if (s.repetitions === 0 && !s.lastReviewedAt) {
      newCount += 1;
    } else if (s.interval < MASTERED_INTERVAL_DAYS) {
      learning += 1;
    } else {
      mastered += 1;
    }
    if (s.lastReviewedAt) {
      reviewed += 1;
      easeSum += s.easeFactor;
      if (s.lapses === 0) {
        neverLapsed += 1;
      }
    }
  }

  const dueForecast = forecastDays.map((date, i) => ({ date, count: forecastCounts[i] }));
  const needsAttention = cards
    .filter((concept) => concept.schedule.lapses >= 2)
    .sort((a, b) => b.schedule.lapses - a.schedule.lapses);

  return {
    total: cards.length,
    due,
    newCount,
    learning,
    mastered,
    retentionPct: reviewed === 0 ? null : Math.round((neverLapsed / reviewed) * 100),
    avgEase: reviewed === 0 ? null : easeSum / reviewed,
    needsAttention,
    dueForecast,
  };
}

export type ConceptDifficulty = 'new' | 'struggling' | 'solid' | 'strong';

/**
 * A card's difficulty from its SM-2 ease factor, for the deck UI. A
 * never-reviewed card is 'new' (no signal yet); thresholds are tunable.
 */
export function getConceptDifficulty(card: ConceptCard): ConceptDifficulty {
  if (!card.schedule.lastReviewedAt) {
    return 'new';
  }
  const ease = card.schedule.easeFactor;
  if (ease < 2.1) {
    return 'struggling';
  }
  if (ease < 2.5) {
    return 'solid';
  }
  return 'strong';
}
