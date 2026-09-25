import { newConceptSchedule } from './concept-cards';
import type { ConceptCard, Quote, QuoteCategory } from './types';
import { generateId, normalizeQuickLinkUrl } from './utils';

export interface ConceptCardInput {
  term: string;
  definition: string;
  details?: string;
  tags?: string[];
  source?: string;
  sourceUrl?: string;
}

export interface CustomQuoteInput {
  text: string;
  author: string;
  category: QuoteCategory;
  source?: string;
  notes?: string;
  sourceUrl?: string;
}

function optionalText(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function buildConceptCard(input: ConceptCardInput, now: Date): ConceptCard {
  return {
    id: generateId(),
    term: input.term.trim(),
    definition: input.definition.trim(),
    details: optionalText(input.details),
    tags: input.tags && input.tags.length > 0 ? input.tags : undefined,
    source: optionalText(input.source),
    sourceUrl: optionalText(input.sourceUrl),
    createdAt: now.toISOString(),
    schedule: newConceptSchedule(now),
  };
}

export function buildCustomQuote(input: CustomQuoteInput): Quote {
  return {
    id: `custom-${generateId()}`,
    text: input.text.trim(),
    author: input.author.trim(),
    category: input.category,
    isCustom: true,
    isFavorite: false,
    isHidden: false,
    viewCount: 0,
    source: optionalText(input.source),
    sourceUrl: optionalText(input.sourceUrl),
    notes: optionalText(input.notes),
  };
}

export interface CapturedPage {
  /** Only an absolute http(s) URL: a file:// or chrome:// page keeps no link. */
  sourceUrl?: string;
  /** The page title, else its host. */
  source?: string;
  host?: string;
}

export function describeCapturedPage(pageUrl: string, pageTitle?: string): CapturedPage {
  const sourceUrl = /^https?:\/\//i.test(pageUrl.trim())
    ? (normalizeQuickLinkUrl(pageUrl) ?? undefined)
    : undefined;
  let host: string | undefined;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '') || undefined;
  } catch {
    host = undefined;
  }
  return { sourceUrl, source: optionalText(pageTitle) ?? host, host };
}

const MAX_TERM_LENGTH = 80;
const MAX_AUTHOR_LINE_LENGTH = 60;

function nonEmptyLineIndexes(lines: string[]): number[] {
  return lines.flatMap((line, index) => (line.trim() ? [index] : []));
}

/** A short first line that does not read as a sentence becomes the term; the rest defines it. */
export function splitConceptSelection(text: string): { term: string; definition: string } {
  const lines = text.split(/\r?\n/);
  const [first] = nonEmptyLineIndexes(lines);
  if (first === undefined) {
    return { term: '', definition: '' };
  }
  const term = lines[first].trim();
  const definition = lines
    .slice(first + 1)
    .join('\n')
    .trim();
  if (definition && term.length <= MAX_TERM_LENGTH && !/[.!?:]$/.test(term)) {
    return { term, definition };
  }
  return { term: '', definition: text.trim() };
}

/** A short last line opening with a dash is the attribution: "…quote.\n— Oscar Wilde". */
export function splitQuoteSelection(text: string): { text: string; author: string } {
  const lines = text.split(/\r?\n/);
  const indexes = nonEmptyLineIndexes(lines);
  const last = indexes.at(-1);
  if (last === undefined || indexes.length < 2) {
    return { text: text.trim(), author: '' };
  }
  const attribution = lines[last].trim();
  const author = attribution.replace(/^[—–-]+\s*/, '').trim();
  if (attribution.length <= MAX_AUTHOR_LINE_LENGTH && /^[—–-]/.test(attribution) && author !== '') {
    return { text: lines.slice(0, last).join('\n').trim(), author };
  }
  return { text: text.trim(), author: '' };
}
