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

describe('a file with one bad item among good ones', () => {
  // Recording a skip as an *error* makes `isValid` false, which hides the Import button
  // entirely — discarding every good item in the file to report one bad one.
  // Nothing here is rejected outright any more: every field is either coerced to something
  // the reader accepts or filtered per item. What matters is that a file carrying oddities
  // still imports, rather than being marked invalid and losing the Import button entirely.
  it('stays importable, and keeps the items around the oddity', () => {
    const good = {
      id: 'g1',
      text: 'keep me',
      completed: false,
      createdAt: 'x',
      date: '2026-07-26',
    };
    const result = importOf({ goals: [good, { id: 'g2', text: 't', createdAt: {}, date: 42 }] });

    expect(result.isValid).toBe(true);
    expect(result.data?.goals).toHaveLength(2);
    expect(goalSchema.safeParse(result.data?.goals?.[1]).success).toBe(true);
  });

  // One malformed subtask costs that subtask, not the goal carrying it — the same rule the
  // storage lists follow.
  it('keeps a goal whose subtask list has one bad entry', () => {
    const goal = {
      id: 'g1',
      text: 'has subtasks',
      completed: false,
      createdAt: 'x',
      date: '2026-07-26',
      subtasks: [{ id: 's1', text: 'fine', completed: false }, 'not a subtask'],
    };

    const result = importOf({ goals: [goal] });

    expect(result.data?.goals).toHaveLength(1);
    expect(result.data?.goals?.[0].subtasks).toEqual([
      { id: 's1', text: 'fine', completed: false },
    ]);
  });
});

describe('the import preview envelope', () => {
  // The preview renders `version` straight into JSX. An object reaching React as a child
  // throws, and the app-wide ErrorBoundary takes the Insights page down — on the one input
  // where the user points the app at a file of their choosing.
  it.each([
    ['an object version', { version: { major: 1 } }],
    ['an array version', { version: ['1'] }],
    ['a string formatVersion', { formatVersion: '3' }],
  ])('renders a primitive even when the file carries %s', (_label, envelope) => {
    const result = importOf(envelope);

    expect(typeof result.data?.version).toBe('string');
    expect(typeof result.data?.formatVersion).toBe('number');
  });
});
