import { describe, expect, it } from 'vitest';
import {
  conceptIntervalLabel,
  getConceptStats,
  getDueConceptCards,
  newConceptSchedule,
  projectConceptInterval,
  reviewConceptCard,
  shouldShowConceptNudge,
} from './concept-cards';
import type { ConceptCard, ConceptSchedule } from './types';

const TODAY = new Date('2026-06-16T09:00:00.000Z');

function schedule(overrides: Partial<ConceptSchedule> = {}): ConceptSchedule {
  return {
    dueDate: '2026-06-16',
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    ...overrides,
  };
}

function card(overrides: Partial<ConceptCard> = {}): ConceptCard {
  return {
    id: 'c1',
    term: 'Saga pattern',
    definition: 'A sequence of local transactions with compensating actions.',
    createdAt: '2026-06-01T00:00:00.000Z',
    schedule: schedule(overrides.schedule),
    ...overrides,
  };
}

describe('Concept card spaced repetition', () => {
  describe('newConceptSchedule', () => {
    it('creates a card due today with default ease', () => {
      expect(newConceptSchedule(TODAY)).toEqual({
        dueDate: '2026-06-16',
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        lapses: 0,
      });
    });
  });

  describe('projectConceptInterval', () => {
    it('relearns on again', () => {
      expect(projectConceptInterval(schedule({ repetitions: 5, interval: 20 }), 'again')).toBe(0);
    });

    it('walks good 1 → 6 → interval×ease', () => {
      expect(projectConceptInterval(schedule({ repetitions: 0 }), 'good')).toBe(1);
      expect(projectConceptInterval(schedule({ repetitions: 1 }), 'good')).toBe(6);
      expect(
        projectConceptInterval(schedule({ repetitions: 2, interval: 6, easeFactor: 2.5 }), 'good')
      ).toBe(15);
    });

    it('jumps further on easy', () => {
      expect(projectConceptInterval(schedule({ repetitions: 0 }), 'easy')).toBe(4);
      expect(
        projectConceptInterval(schedule({ repetitions: 3, interval: 6, easeFactor: 2.5 }), 'easy')
      ).toBe(Math.round(6 * 2.5 * 1.3));
    });
  });

  describe('conceptIntervalLabel', () => {
    it('formats day counts', () => {
      expect(conceptIntervalLabel(0)).toBe('<10m');
      expect(conceptIntervalLabel(1)).toBe('1d');
      expect(conceptIntervalLabel(6)).toBe('6d');
      expect(conceptIntervalLabel(14)).toBe('2w');
      expect(conceptIntervalLabel(60)).toBe('2mo');
      expect(conceptIntervalLabel(400)).toBe('1y');
    });
  });

  describe('reviewConceptCard', () => {
    it('advances a new card on good (due tomorrow, reps up)', () => {
      const result = reviewConceptCard(card(), 'good', TODAY);
      expect(result.schedule.interval).toBe(1);
      expect(result.schedule.dueDate).toBe('2026-06-17');
      expect(result.schedule.repetitions).toBe(1);
      expect(result.schedule.easeFactor).toBe(2.5);
      expect(result.schedule.lastReviewedAt).toBe(TODAY.toISOString());
    });

    it('eases up and jumps on easy', () => {
      const result = reviewConceptCard(card(), 'easy', TODAY);
      expect(result.schedule.interval).toBe(4);
      expect(result.schedule.dueDate).toBe('2026-06-20');
      expect(result.schedule.easeFactor).toBeCloseTo(2.65);
    });

    it('resets and counts a lapse on again', () => {
      const result = reviewConceptCard(
        card({ schedule: schedule({ repetitions: 4, interval: 12 }) }),
        'again',
        TODAY
      );
      expect(result.schedule.interval).toBe(0);
      expect(result.schedule.dueDate).toBe('2026-06-16');
      expect(result.schedule.repetitions).toBe(0);
      expect(result.schedule.lapses).toBe(1);
      expect(result.schedule.easeFactor).toBeCloseTo(2.3);
    });

    it('floors the ease factor at 1.3', () => {
      const result = reviewConceptCard(
        card({ schedule: schedule({ easeFactor: 1.4 }) }),
        'again',
        TODAY
      );
      expect(result.schedule.easeFactor).toBe(1.3);
    });

    it('caps the interval at one year', () => {
      const result = reviewConceptCard(
        card({ schedule: schedule({ repetitions: 9, interval: 320, easeFactor: 2.6 }) }),
        'good',
        TODAY
      );
      expect(result.schedule.interval).toBe(365);
    });
  });

  describe('getDueConceptCards', () => {
    it('returns only due cards, most-overdue first', () => {
      const overdue = card({ id: 'overdue', schedule: schedule({ dueDate: '2026-06-10' }) });
      const dueToday = card({ id: 'today', schedule: schedule({ dueDate: '2026-06-16' }) });
      const future = card({ id: 'future', schedule: schedule({ dueDate: '2026-07-01' }) });

      const due = getDueConceptCards([dueToday, future, overdue], TODAY);

      expect(due.map((c) => c.id)).toEqual(['overdue', 'today']);
    });

    it('orders same-day cards by least-recently-seen', () => {
      const seenEarlier = card({
        id: 'earlier',
        schedule: schedule({ lastReviewedAt: '2026-06-15T08:00:00.000Z' }),
      });
      const seenLater = card({
        id: 'later',
        schedule: schedule({ lastReviewedAt: '2026-06-15T20:00:00.000Z' }),
      });

      const due = getDueConceptCards([seenLater, seenEarlier], TODAY);

      expect(due.map((c) => c.id)).toEqual(['earlier', 'later']);
    });
  });

  describe('shouldShowConceptNudge', () => {
    const base = {
      enabled: true,
      conceptCount: 0,
      totalQuoteViews: 150,
      state: { dismissed: false, count: 0, lastShownAt: null },
      today: '2026-06-16',
    };

    it('shows for an engaged user with no cards', () => {
      expect(shouldShowConceptNudge(base)).toBe(true);
    });

    it('does not show when disabled, dismissed, or cards already exist', () => {
      expect(shouldShowConceptNudge({ ...base, enabled: false })).toBe(false);
      expect(shouldShowConceptNudge({ ...base, conceptCount: 1 })).toBe(false);
      expect(shouldShowConceptNudge({ ...base, state: { ...base.state, dismissed: true } })).toBe(
        false
      );
    });

    it('does not show below the quote-view threshold', () => {
      expect(shouldShowConceptNudge({ ...base, totalQuoteViews: 40 })).toBe(false);
    });

    it('stops after the max shows', () => {
      expect(shouldShowConceptNudge({ ...base, state: { ...base.state, count: 2 } })).toBe(false);
    });

    it('respects the multi-day gap since the last show', () => {
      expect(
        shouldShowConceptNudge({
          ...base,
          state: { dismissed: false, count: 1, lastShownAt: '2026-06-15' },
        })
      ).toBe(false);
      expect(
        shouldShowConceptNudge({
          ...base,
          state: { dismissed: false, count: 1, lastShownAt: '2026-06-10' },
        })
      ).toBe(true);
    });
  });

  describe('getConceptStats', () => {
    it('counts due, buckets, retention, attention, and a 7-day forecast', () => {
      const cards = [
        card({
          id: 'new',
          schedule: schedule({ dueDate: '2026-06-16', repetitions: 0, interval: 0 }),
        }),
        card({
          id: 'learn',
          schedule: schedule({
            dueDate: '2026-06-19',
            repetitions: 2,
            interval: 6,
            lapses: 0,
            lastReviewedAt: '2026-06-13T00:00:00.000Z',
          }),
        }),
        card({
          id: 'master',
          schedule: schedule({
            dueDate: '2026-06-10',
            repetitions: 5,
            interval: 40,
            easeFactor: 2.6,
            lapses: 1,
            lastReviewedAt: '2026-05-01T00:00:00.000Z',
          }),
        }),
      ];

      const stats = getConceptStats(cards, TODAY);

      expect(stats.total).toBe(3);
      expect(stats.due).toBe(2); // 'new' (today) + 'master' (overdue)
      expect(stats.newCount).toBe(1);
      expect(stats.learning).toBe(1);
      expect(stats.mastered).toBe(1);
      expect(stats.retentionPct).toBe(50); // 2 reviewed, 1 never lapsed
      expect(stats.needsAttention).toEqual([]);
      expect(stats.dueForecast).toHaveLength(7);
      // today's bar carries all due (incl. the overdue 'master') and reconciles with `due`
      expect(stats.dueForecast[0]).toEqual({ date: '2026-06-16', count: 2 });
      expect(stats.dueForecast[0].count).toBe(stats.due);
      expect(stats.dueForecast[3]).toEqual({ date: '2026-06-19', count: 1 });
    });

    it('treats interval 21 as mastered and 20 as learning', () => {
      const at20 = card({ id: 'l', schedule: schedule({ repetitions: 3, interval: 20 }) });
      const at21 = card({ id: 'm', schedule: schedule({ repetitions: 3, interval: 21 }) });

      const stats = getConceptStats([at20, at21], TODAY);

      expect(stats.learning).toBe(1);
      expect(stats.mastered).toBe(1);
    });

    it('buckets a lapsed (relearning) card as learning, not new', () => {
      const relearning = card({
        id: 'relearn',
        schedule: schedule({
          repetitions: 0,
          interval: 0,
          lapses: 1,
          lastReviewedAt: '2026-06-15T00:00:00.000Z',
        }),
      });
      const fresh = card({ id: 'fresh', schedule: schedule({ repetitions: 0, interval: 0 }) });

      const stats = getConceptStats([relearning, fresh], TODAY);

      expect(stats.newCount).toBe(1); // only 'fresh' is truly new
      expect(stats.learning).toBe(1); // 'relearn' has review history
    });

    it('averages ease over reviewed cards only', () => {
      const reviewedLowEase = card({
        id: 'r',
        schedule: schedule({
          easeFactor: 1.5,
          repetitions: 3,
          interval: 10,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
        }),
      });
      const brandNew = card({ id: 'n', schedule: schedule({ easeFactor: 2.5, repetitions: 0 }) });

      const stats = getConceptStats([reviewedLowEase, brandNew], TODAY);

      expect(stats.avgEase).toBe(1.5); // the never-reviewed 2.5 default is excluded
    });

    it('returns null retention and ease for an empty deck', () => {
      const stats = getConceptStats([], TODAY);

      expect(stats.total).toBe(0);
      expect(stats.retentionPct).toBeNull();
      expect(stats.avgEase).toBeNull();
      expect(stats.dueForecast).toHaveLength(7);
    });

    it('sorts needs-attention by lapses desc and excludes lapses < 2', () => {
      const cards = [
        card({
          id: 'a',
          schedule: schedule({ lapses: 1, lastReviewedAt: '2026-06-10T00:00:00.000Z' }),
        }),
        card({
          id: 'b',
          schedule: schedule({ lapses: 4, lastReviewedAt: '2026-06-10T00:00:00.000Z' }),
        }),
        card({
          id: 'c',
          schedule: schedule({ lapses: 2, lastReviewedAt: '2026-06-10T00:00:00.000Z' }),
        }),
      ];

      const stats = getConceptStats(cards, TODAY);

      expect(stats.needsAttention.map((concept) => concept.id)).toEqual(['b', 'c']);
    });

    it('reports 100% retention when no reviewed card has lapsed', () => {
      const cards = [
        card({
          id: 'r',
          schedule: schedule({ lapses: 0, lastReviewedAt: '2026-06-10T00:00:00.000Z' }),
        }),
        card({ id: 'unseen', schedule: schedule({ lastReviewedAt: undefined }) }),
      ];

      const stats = getConceptStats(cards, TODAY);

      expect(stats.retentionPct).toBe(100); // 'unseen' is excluded (never reviewed)
    });
  });
});
