import { describe, expect, it } from 'vitest';
import { CAPTURE_NOW, SELECTIONS } from './__fixtures__/capture.fixtures';
import {
  buildConceptCard,
  buildCustomQuote,
  describeCapturedPage,
  splitConceptSelection,
  splitQuoteSelection,
} from './capture';
import { newConceptSchedule } from './concept-cards';
import { conceptCardSchema, quoteSchema } from './schemas';

describe('splitConceptSelection', () => {
  it('takes a glossary entry apart into term and definition', () => {
    expect(splitConceptSelection(SELECTIONS.glossaryEntry)).toEqual({
      term: 'Idempotence',
      definition: 'An operation that has the same effect however many times it runs.',
    });
  });

  it('skips blank lines and padding around a dt/dd pair', () => {
    expect(splitConceptSelection(SELECTIONS.definitionList)).toEqual({
      term: 'Saga pattern',
      definition: 'A sequence of local transactions, each with a compensating step.',
    });
  });

  it('keeps every paragraph after a heading as the definition', () => {
    expect(splitConceptSelection(SELECTIONS.headingAndParagraphs).definition).toBe(
      'A consumer signals it is full.\n\nThe producer slows down.'
    );
  });

  it('infers no term from a single line', () => {
    expect(splitConceptSelection(SELECTIONS.singleLine)).toEqual({
      term: '',
      definition: SELECTIONS.singleLine,
    });
  });

  it.each([
    ['ends in a full stop', SELECTIONS.sentenceFirstLine],
    ['ends in a colon', SELECTIONS.colonFirstLine],
    ['is over 80 characters', SELECTIONS.overLongFirstLine],
  ])('infers no term when the first line %s', (_, text) => {
    expect(splitConceptSelection(text).term).toBe('');
  });

  it('infers no term when nothing follows the first line', () => {
    expect(splitConceptSelection(SELECTIONS.lonelyTerm)).toEqual({
      term: '',
      definition: 'Only a heading',
    });
  });
});

describe('splitQuoteSelection', () => {
  it.each([
    ['an em dash', SELECTIONS.quoteWithEmDash, 'Oscar Wilde'],
    ['an en dash', SELECTIONS.quoteWithEnDash, 'Steve Jobs'],
    ['a hyphen', SELECTIONS.quoteWithHyphen, 'Edsger Dijkstra'],
  ])('reads the author from a last line opening with %s', (_, text, author) => {
    expect(splitQuoteSelection(text).author).toBe(author);
  });

  it('keeps the lines above the attribution as the quote', () => {
    expect(splitQuoteSelection(SELECTIONS.quoteWithEnDash).text).toBe(
      'Stay hungry.\nStay foolish.'
    );
  });

  it.each([
    ['has no dash', SELECTIONS.quoteWithoutAttribution],
    ['is over 60 characters', SELECTIONS.quoteWithLongAttribution],
    ['is the only line', SELECTIONS.onlyAttribution],
    ['is a bare dash', SELECTIONS.bareDash],
    ['is the flattened context-menu text', SELECTIONS.singleLine],
  ])('infers no author when the last line %s', (_, text) => {
    expect(splitQuoteSelection(text)).toEqual({ text: text.trim(), author: '' });
  });
});

describe('buildConceptCard', () => {
  it('trims the text and schedules the card for review today', () => {
    const card = buildConceptCard({ term: '  CAP  ', definition: ' Pick two. ' }, CAPTURE_NOW);

    expect(card).toMatchObject({
      term: 'CAP',
      definition: 'Pick two.',
      createdAt: CAPTURE_NOW.toISOString(),
      schedule: newConceptSchedule(CAPTURE_NOW),
    });
  });

  it('collapses blank optional fields and an empty tag list to undefined', () => {
    const card = buildConceptCard(
      { term: 'CAP', definition: 'Pick two.', details: ' ', tags: [], source: '', sourceUrl: ' ' },
      CAPTURE_NOW
    );

    expect(card).toMatchObject({
      details: undefined,
      tags: undefined,
      source: undefined,
      sourceUrl: undefined,
    });
  });

  it('mints a record the stored-card schema accepts', () => {
    const card = buildConceptCard(
      { term: 'CAP', definition: 'Pick two.', sourceUrl: 'https://example.com/cap' },
      CAPTURE_NOW
    );

    expect(conceptCardSchema.safeParse(card).success).toBe(true);
  });
});

describe('buildCustomQuote', () => {
  it('trims the text and marks the quote custom and unseen', () => {
    const quote = buildCustomQuote({ text: ' Go. ', author: ' Me ', category: 'inspiration' });

    expect(quote).toMatchObject({
      text: 'Go.',
      author: 'Me',
      isCustom: true,
      isFavorite: false,
      isHidden: false,
      viewCount: 0,
    });
    expect(quote.id).toMatch(/^custom-/);
  });

  it('collapses blank optional fields to undefined', () => {
    const quote = buildCustomQuote({
      text: 'Go.',
      author: 'Me',
      category: 'inspiration',
      source: ' ',
      notes: '',
      sourceUrl: ' ',
    });

    expect(quote).toMatchObject({ source: undefined, notes: undefined, sourceUrl: undefined });
  });

  it('mints distinct ids for quotes built in the same millisecond', () => {
    const input = { text: 'Go.', author: 'Me', category: 'inspiration' } as const;

    expect(buildCustomQuote(input).id).not.toBe(buildCustomQuote(input).id);
  });

  it('mints a record the stored-quote schema accepts', () => {
    const quote = buildCustomQuote({
      text: 'Go.',
      author: 'Me',
      category: 'inspiration',
      sourceUrl: 'https://example.com/go',
    });

    expect(quoteSchema.safeParse(quote).success).toBe(true);
  });
});

describe('describeCapturedPage', () => {
  it('links an http(s) page and names it by its title', () => {
    expect(describeCapturedPage('https://www.example.com/a?b=1', ' Example ')).toEqual({
      sourceUrl: 'https://www.example.com/a?b=1',
      source: 'Example',
      host: 'example.com',
    });
  });

  it('falls back to the host when the page has no title', () => {
    expect(describeCapturedPage('https://example.com/a', '').source).toBe('example.com');
  });

  it.each([
    'file:///Users/me/notes.html',
    'chrome://settings/',
    'chrome-extension://abc/index.html',
    'about:blank',
  ])('keeps no link to %s', (url) => {
    expect(describeCapturedPage(url, 'Page').sourceUrl).toBeUndefined();
  });

  it('leaves the source unset when there is neither a title nor a host', () => {
    expect(describeCapturedPage('file:///Users/me/notes.html')).toEqual({
      sourceUrl: undefined,
      source: undefined,
      host: undefined,
    });
  });
});
