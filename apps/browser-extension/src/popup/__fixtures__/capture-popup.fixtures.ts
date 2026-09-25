import { vi } from 'vitest';
import type { CaptureDraft } from '../../capture/capture-draft';
import type { CaptureSaveResponse } from '../../capture/capture-messages';
import type { CapturePopupApi } from '../capture-popup-api';

export const GLOSSARY_DRAFT: CaptureDraft = {
  kind: 'concept',
  text: 'Idempotence\nSame effect however many times it runs.',
  pageUrl: 'https://www.example.com/glossary',
  pageTitle: 'Glossary',
  tabId: 7,
};

export const QUOTE_DRAFT: CaptureDraft = {
  kind: 'quote',
  text: 'Be yourself; everyone else is already taken.\n— Oscar Wilde',
  pageUrl: 'https://example.com/wilde',
  pageTitle: 'Wilde quotes',
};

export const UNSCRIPTABLE_DRAFT: CaptureDraft = { kind: 'concept', text: '', pageUrl: '' };

export function createFakeApi(
  draft: CaptureDraft = GLOSSARY_DRAFT,
  saveResponse: CaptureSaveResponse = { ok: true }
) {
  return {
    loadDraft: vi.fn(async () => draft),
    persistDraft: vi.fn(async (_draft: CaptureDraft) => undefined),
    save: vi.fn(async (_draft: CaptureDraft) => saveResponse),
    close: vi.fn(),
  } satisfies CapturePopupApi;
}

export type FakeCaptureApi = ReturnType<typeof createFakeApi>;

export function lastPersistedDraft(api: FakeCaptureApi): CaptureDraft | undefined {
  return api.persistDraft.mock.calls.at(-1)?.[0];
}
