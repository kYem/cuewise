export const CAPTURE_NOW = new Date('2026-09-21T09:30:00.000Z');

export const SELECTIONS = {
  glossaryEntry: 'Idempotence\nAn operation that has the same effect however many times it runs.',
  definitionList:
    '\n  Saga pattern  \n\n  A sequence of local transactions, each with a compensating step.\n',
  headingAndParagraphs: 'Backpressure\nA consumer signals it is full.\n\nThe producer slows down.',
  singleLine: 'A single line the context menu flattened.',
  sentenceFirstLine: 'This is a sentence.\nAnd another follows it.',
  colonFirstLine: 'Note:\nThe meeting moved to Tuesday.',
  overLongFirstLine: `${'x'.repeat(81)}\nThe rest of the paragraph.`,
  lonelyTerm: 'Only a heading\n\n   ',
  quoteWithEmDash: 'Be yourself; everyone else is already taken.\n— Oscar Wilde',
  quoteWithEnDash: 'Stay hungry.\nStay foolish.\n– Steve Jobs  ',
  quoteWithHyphen: 'Simplicity is prerequisite for reliability.\n\n- Edsger Dijkstra',
  quoteWithoutAttribution: 'Just a quote\nacross two lines',
  quoteWithLongAttribution: `Text\n— ${'y'.repeat(60)}`,
  onlyAttribution: '— Anonymous',
  bareDash: 'Text\n—',
} as const;
