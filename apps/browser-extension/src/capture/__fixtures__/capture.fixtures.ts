import { createChromeStorageMock } from '@cuewise/test-utils/mocks';
import { vi } from 'vitest';
import { CAPTURE_DRAFT_KEY, type CaptureDraft } from '../capture-draft';
import { CAPTURE_MENU_IDS } from '../capture-handler';

export const PAGE = {
  url: 'https://martinfowler.com/articles/saga.html',
  title: 'Saga pattern — Martin Fowler',
  tabId: 42,
};

export const DOM_SELECTION = 'Saga pattern\nA sequence of local transactions.';
export const FLATTENED_SELECTION = 'Saga pattern A sequence of local transactions.';

export function buildDraft(overrides: Partial<CaptureDraft> = {}): CaptureDraft {
  return {
    kind: 'concept',
    text: DOM_SELECTION,
    pageUrl: PAGE.url,
    pageTitle: PAGE.title,
    tabId: PAGE.tabId,
    ...overrides,
  };
}

export function buildMenuClick(
  overrides: Partial<chrome.contextMenus.OnClickData> = {}
): chrome.contextMenus.OnClickData {
  return {
    menuItemId: CAPTURE_MENU_IDS.concept,
    editable: false,
    pageUrl: PAGE.url,
    selectionText: FLATTENED_SELECTION,
    frameId: 0,
    ...overrides,
  };
}

export function buildSourceTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return { id: PAGE.tabId, url: PAGE.url, title: PAGE.title, ...overrides } as chrome.tabs.Tab;
}

export function installCaptureChromeMock() {
  const session = createChromeStorageMock();
  const mock = {
    storage: { session },
    scripting: {
      executeScript: vi.fn(async () => [{ frameId: 0, result: DOM_SELECTION }]),
    },
    action: { openPopup: vi.fn(async () => undefined) },
    windows: { create: vi.fn(async () => ({})) },
    tabs: { query: vi.fn(async () => [buildSourceTab()]) },
    contextMenus: { create: vi.fn(), removeAll: vi.fn(async () => undefined) },
    runtime: {
      getURL: (path: string) => `chrome-extension://cuewise/${path}`,
      lastError: undefined as chrome.runtime.LastError | undefined,
      sendMessage: vi.fn(),
    },
  };
  const existing = (globalThis as { chrome?: Record<string, unknown> }).chrome ?? {};
  (globalThis as { chrome?: unknown }).chrome = {
    ...existing,
    ...mock,
    storage: { ...(existing.storage as object), session },
  };
  return mock;
}

export type CaptureChromeMock = ReturnType<typeof installCaptureChromeMock>;

export function storedDraft(mock: CaptureChromeMock): unknown {
  return mock.storage.session.data[CAPTURE_DRAFT_KEY];
}

export function seedDraft(mock: CaptureChromeMock, draft: CaptureDraft): void {
  mock.storage.session.data[CAPTURE_DRAFT_KEY] = draft;
}
