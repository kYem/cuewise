import { describe, expect, it } from 'vitest';
import { goalSchema, pomodoroSessionSchema, quoteSchema } from './schemas';
import { parseImportData } from './utils';

/**
 * The write boundary must not admit what the read boundary deletes. Every item that
 * survives an import is checked here against the very schema the storage reader applies —
 * anything that slips through is an item the user is told they imported, which then
 * disappears on the next read and is erased by the next edit.
 */
function importOf(payload: Record<string, unknown>) {
  return parseImportData(JSON.stringify({ formatVersion: 1, ...payload }));
}

describe('imported items always satisfy the read schemas', () => {
  it.each([
    ['an unrecognised category', { id: 'q1', text: 't', category: 'philosophy' }],
    ['a numeric viewCount as a string', { id: 'q2', text: 't', viewCount: '5' }],
    ['a numeric lastViewed', { id: 'q3', text: 't', lastViewed: 1234 }],
  ])('normalises or rejects a quote with %s', (_label, quote) => {
    const result = importOf({ quotes: [quote] });

    for (const imported of result.data?.quotes ?? []) {
      expect(quoteSchema.safeParse(imported).success).toBe(true);
    }
  });

  it.each([
    ['a numeric createdAt', { id: 'g1', text: 't', createdAt: 1700000000000 }],
    ['subtasks that are bare strings', { id: 'g2', text: 't', subtasks: ['walk the dog'] }],
  ])('normalises or rejects a goal with %s', (_label, goal) => {
    const result = importOf({ goals: [goal] });

    for (const imported of result.data?.goals ?? []) {
      expect(goalSchema.safeParse(imported).success).toBe(true);
    }
  });

  it('normalises or rejects a session with an unrecognised type', () => {
    const result = importOf({
      pomodoroSessions: [{ id: 's1', startedAt: 'x', type: 'meditation' }],
    });

    for (const imported of result.data?.pomodoroSessions ?? []) {
      expect(pomodoroSessionSchema.safeParse(imported).success).toBe(true);
    }
  });

  // Rejecting costs one item and says so; accepting costs it silently, later.
  it('tells the user which item it skipped rather than importing it invisibly', () => {
    const result = importOf({ goals: [{ id: 'g1', text: 't', subtasks: ['not a subtask'] }] });

    expect(result.data?.goals ?? []).toEqual([]);
    expect(result.errors.some((e) => e.field === 'goals[0]')).toBe(true);
  });

  it('still imports a well-formed item untouched', () => {
    const goal = {
      id: 'g1',
      text: 'ship it',
      completed: false,
      createdAt: 'x',
      date: '2026-07-26',
    };

    const result = importOf({ goals: [goal] });

    expect(result.data?.goals).toHaveLength(1);
    expect(goalSchema.safeParse(result.data?.goals?.[0]).success).toBe(true);
  });
});
