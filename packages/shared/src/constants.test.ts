import { describe, expect, it } from 'vitest';
import { CONCEPT_TEMPLATES, DEFAULT_SETTINGS } from './constants';

describe('DEFAULT_SETTINGS', () => {
  it('enables celebrations by default', () => {
    expect(DEFAULT_SETTINGS.celebrationsEnabled).toBe(true);
  });

  it('defaults the reminders panel to the composed layout', () => {
    expect(DEFAULT_SETTINGS.reminderPanelLayout).toBe('composed');
  });

  it('leaves the reminders panel unpinned by default', () => {
    expect(DEFAULT_SETTINGS.reminderPanelPinned).toBe(false);
  });

  it('keeps the Glass enhancement opt-in (off by default)', () => {
    expect(DEFAULT_SETTINGS.glassEnhanced).toBe(false);
  });
});

// The import path silently skips blanks and duplicate terms, so a bad pack edit
// would ship a pack that advertises N cards but imports fewer — fail here instead.
describe('CONCEPT_TEMPLATES integrity', () => {
  it('pack ids are unique', () => {
    const ids = CONCEPT_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every card has a non-blank term and definition', () => {
    for (const template of CONCEPT_TEMPLATES) {
      for (const card of template.cards) {
        expect(card.term.trim(), `${template.id}: blank term`).not.toBe('');
        expect(card.definition.trim(), `${template.id}: "${card.term}"`).not.toBe('');
      }
    }
  });

  it('terms are unique within each pack (case-insensitive, trimmed)', () => {
    for (const template of CONCEPT_TEMPLATES) {
      const terms = template.cards.map((card) => card.term.trim().toLowerCase());
      expect(new Set(terms).size, template.id).toBe(terms.length);
    }
  });
});
