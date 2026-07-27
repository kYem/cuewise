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
  ])('normalises a quote with %s rather than dropping it', (_label, quote) => {
    const result = importOf({ quotes: [quote] });

    // The count first: iterating an empty array satisfies any conformance check, so
    // "normalised" and "silently dropped" looked identical until this line existed.
    expect(result.data?.quotes).toHaveLength(1);
    expect(quoteSchema.safeParse(result.data?.quotes?.[0]).success).toBe(true);
  });

  it('normalises an unknown category to the default rather than keeping it', () => {
    const result = importOf({ quotes: [{ id: 'q1', text: 't', category: 'philosophy' }] });

    expect(result.data?.quotes?.[0].category).toBe('inspiration');
  });

  it('normalises a non-numeric viewCount to zero', () => {
    const result = importOf({ quotes: [{ id: 'q1', text: 't', viewCount: '5' }] });

    expect(result.data?.quotes?.[0].viewCount).toBe(0);
  });

  it('drops a non-string lastViewed rather than carrying it through', () => {
    const result = importOf({ quotes: [{ id: 'q1', text: 't', lastViewed: 1234 }] });

    expect(result.data?.quotes?.[0].lastViewed).toBeUndefined();
  });

  it.each([
    ['a numeric createdAt', { id: 'g1', text: 't', createdAt: 1700000000000 }],
    ['subtasks that are bare strings', { id: 'g2', text: 't', subtasks: ['walk the dog'] }],
  ])('normalises a goal with %s rather than dropping it', (_label, goal) => {
    const result = importOf({ goals: [goal] });

    expect(result.data?.goals).toHaveLength(1);
    expect(goalSchema.safeParse(result.data?.goals?.[0]).success).toBe(true);
  });

  it('replaces a non-string createdAt rather than writing it through', () => {
    const result = importOf({ goals: [{ id: 'g1', text: 't', createdAt: 1700000000000 }] });

    expect(typeof result.data?.goals?.[0].createdAt).toBe('string');
  });

  // The last gate before an imported item reaches storage, and nothing reached it: every
  // field is coerced above, so a file our own export wrote always passes. `1e400` is the way
  // in — JSON.parse yields `Infinity`, which the coercion sees as a `number` and the schema
  // does not. Written as raw JSON text because no JS literal survives the round trip.
  it('skips an item the schema still rejects after every coercion', () => {
    const raw =
      '{"formatVersion":1,"pomodoroSessions":[{"id":"s1","startedAt":"x","duration":1e400}]}';

    const result = parseImportData(raw);

    expect(result.data?.pomodoroSessions).toEqual([]);
    expect(result.warnings.join(' ')).toContain('does not match the expected shape');
  });

  // A skip is a warning, never an error: `isValid` is `errors.length === 0`, so recording it
  // as an error would hide the Import button and discard every good item in the file.
  it('still lets the rest of the file import', () => {
    const raw =
      '{"formatVersion":1,"pomodoroSessions":[{"id":"s1","startedAt":"x","duration":1e400}],' +
      '"goals":[{"id":"g1","text":"keep me"}]}';

    const result = parseImportData(raw);

    expect(result.isValid).toBe(true);
    expect(result.data?.goals).toHaveLength(1);
  });

  // The twelfth Quote field, and the last one the importer learned to carry. Dropping it is
  // invisible to a schema check — `collectionIds` is optional — so re-importing a backup
  // silently emptied every collection while reporting a clean import.
  it('carries collection membership through an import', async () => {
    const result = importOf({ quotes: [{ id: 'q1', text: 't', collectionIds: ['c1', 'c2'] }] });

    expect(result.data?.quotes?.[0].collectionIds).toEqual(['c1', 'c2']);
  });

  it('keeps the usable ids when one member is malformed, rather than dropping the field', () => {
    const result = importOf({ quotes: [{ id: 'q1', text: 't', collectionIds: ['c1', 42] }] });

    expect(result.data?.quotes?.[0].collectionIds).toEqual(['c1']);
  });

  // Both ends of the same coercion. The schemas accept any string, so an empty one imports
  // clean and then groups under a blank date header or shows a blank author — invisible to
  // the round-trip checks above, which only ask whether the schema still matches.
  it('substitutes today for an empty date rather than importing a blank one', () => {
    const result = importOf({ goals: [{ id: 'g1', text: 't', date: '', createdAt: '' }] });

    expect(result.data?.goals?.[0].date).not.toBe('');
    expect(result.data?.goals?.[0].createdAt).not.toBe('');
  });

  it('substitutes Unknown for an empty author', () => {
    const result = importOf({ quotes: [{ id: 'q1', text: 't', author: '' }] });

    expect(result.data?.quotes?.[0].author).toBe('Unknown');
  });

  it.each([
    ['an unrecognised type', { id: 's1', startedAt: 'x', type: 'meditation' }, 'type', 'work'],
    ['a non-numeric duration', { id: 's2', startedAt: 'x', duration: '25' }, 'duration', 25],
  ])('normalises a session with %s', (_label, session, field, expected) => {
    const result = importOf({ pomodoroSessions: [session] });

    expect(result.data?.pomodoroSessions).toHaveLength(1);
    expect((result.data?.pomodoroSessions?.[0] as unknown as Record<string, unknown>)[field]).toBe(
      expected
    );
    expect(pomodoroSessionSchema.safeParse(result.data?.pomodoroSessions?.[0]).success).toBe(true);
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

// A rejected item is a per-item outcome, not a verdict on the file. `isValid` is
// `errors.length === 0`, and a false verdict hides the Import button entirely — so one
// null element in a backup would make every good item in it unreachable.
describe('a backup carrying an item that cannot be read at all', () => {
  const good = { id: 'g1', text: 'keep me', completed: false, createdAt: 'x', date: '2026-07-26' };

  it.each([
    ['a null element', null],
    ['a numeric id', { id: 7, text: 't' }],
    ['no text', { id: 'g2' }],
  ])('still imports the rest when goals contain %s', (_label, bad) => {
    const result = importOf({ goals: [good, bad] });

    expect(result.isValid).toBe(true);
    expect(result.data?.goals).toEqual([good]);
    expect(result.warnings.join(' ')).toContain('goals[1]');
  });

  it('still imports the rest when a quote is unreadable', () => {
    const quote = { id: 'q1', text: 'a quote' };
    const result = importOf({ quotes: [quote, null] });

    expect(result.isValid).toBe(true);
    expect(result.data?.quotes).toHaveLength(1);
  });
});
