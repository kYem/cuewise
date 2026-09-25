import { splitConceptSelection, splitQuoteSelection } from '@cuewise/shared';
import { z } from 'zod/mini';

export const CAPTURE_DRAFT_KEY = 'captureDraft';

export const captureKindSchema = z.enum(['concept', 'quote']);
export type CaptureKind = z.infer<typeof captureKindSchema>;

export const captureDraftSchema = z.object({
  kind: captureKindSchema,
  text: z.string(),
  pageUrl: z.string(),
  pageTitle: z.optional(z.string()),
  tabId: z.optional(z.number()),
  term: z.optional(z.string()),
  definition: z.optional(z.string()),
  quoteText: z.optional(z.string()),
  author: z.optional(z.string()),
});

/**
 * One in-flight capture, in `chrome.storage.session`: cleared on browser close, never synced.
 * `text` is the selection as captured; the field keys are the popup's edits, absent until made.
 */
export type CaptureDraft = z.infer<typeof captureDraftSchema>;

export interface CaptureFields {
  term: string;
  definition: string;
  quoteText: string;
  author: string;
}

/** The popup's edits where it made them, else what the selection's line breaks suggest. */
export function resolveCaptureFields(draft: CaptureDraft): CaptureFields {
  const concept = splitConceptSelection(draft.text);
  const quote = splitQuoteSelection(draft.text);
  return {
    term: draft.term ?? concept.term,
    definition: draft.definition ?? concept.definition,
    quoteText: draft.quoteText ?? quote.text,
    author: draft.author ?? quote.author,
  };
}

export async function readCaptureDraft(): Promise<CaptureDraft | null> {
  const stored = (await chrome.storage.session.get(CAPTURE_DRAFT_KEY))[CAPTURE_DRAFT_KEY];
  if (stored === undefined) {
    return null;
  }
  const parsed = captureDraftSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export async function writeCaptureDraft(draft: CaptureDraft): Promise<void> {
  await chrome.storage.session.set({ [CAPTURE_DRAFT_KEY]: draft });
}

export async function clearCaptureDraft(): Promise<void> {
  await chrome.storage.session.remove(CAPTURE_DRAFT_KEY);
}
