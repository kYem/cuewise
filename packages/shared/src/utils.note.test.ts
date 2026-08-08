import { describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH } from './constants';
import { clampNoteLength, truncateNote } from './utils';

describe('truncateNote', () => {
  it('leaves a note at the cap untouched', () => {
    const note = 'x'.repeat(MAX_NOTE_LENGTH);
    expect(truncateNote(note)).toBe(note);
  });

  it('cuts an oversized note to the cap', () => {
    expect(truncateNote('x'.repeat(MAX_NOTE_LENGTH + 1000))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('never cuts through a surrogate pair', () => {
    const emojiOnTheBoundary = `${'x'.repeat(MAX_NOTE_LENGTH - 1)}😀${'x'.repeat(100)}`;
    const cut = truncateNote(emojiOnTheBoundary);

    expect(cut).toHaveLength(MAX_NOTE_LENGTH - 1);
    expect(cut.endsWith('x')).toBe(true);
  });

  it('keeps an emoji that fits inside the cap whole', () => {
    const emojiInside = `${'x'.repeat(MAX_NOTE_LENGTH - 2)}😀${'x'.repeat(100)}`;
    const cut = truncateNote(emojiInside);

    expect(cut).toHaveLength(MAX_NOTE_LENGTH);
    expect(cut.endsWith('😀')).toBe(true);
  });
});

describe('clampNoteLength', () => {
  it('caps an oversized note in a settings patch', () => {
    const patch = clampNoteLength({ note: 'x'.repeat(MAX_NOTE_LENGTH + 1) });
    expect(patch.note).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('leaves a patch without a note untouched', () => {
    const patch = { showClock: true };
    expect(clampNoteLength(patch)).toBe(patch);
  });

  it('leaves an in-range note untouched', () => {
    const patch = { note: 'short' };
    expect(clampNoteLength(patch)).toBe(patch);
  });
});
