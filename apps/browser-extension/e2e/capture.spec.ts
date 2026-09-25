import type { ConceptCard, Quote } from '@cuewise/shared';
import { expect, type Page, test, type Worker } from '@playwright/test';
import type { CaptureDraft } from '../src/capture/capture-draft';
import {
  buildExtension,
  type ExtensionSession,
  launchExtension,
  openNewTab,
} from './extension-harness';

// ENG-133: a native context-menu click cannot be automated, so the worker seeds the draft that
// click would leave; the handler's unit test covers the click itself.
const PAGE_URL = 'https://example.com/glossary';

test.beforeAll(() => {
  buildExtension();
});

// Retried: a worker caught mid-startup has no chrome.storage yet.
async function seedDraft(worker: Worker, draft: CaptureDraft): Promise<void> {
  await expect(async () => {
    await worker.evaluate((value) => chrome.storage.session.set({ captureDraft: value }), draft);
  }).toPass({ timeout: 5_000 });
}

async function openPopup(session: ExtensionSession): Promise<Page> {
  const popup = await session.context.newPage();
  await popup.goto(`chrome-extension://${session.extensionId}/popup.html`);
  return popup;
}

async function readStored<T>(worker: Worker, key: string): Promise<T[]> {
  return worker.evaluate(
    async (storageKey) => ((await chrome.storage.local.get(storageKey))[storageKey] ?? []) as T[],
    key
  );
}

test('a captured concept is stored with its page and reaches an open tab without reload', async () => {
  const session = await launchExtension();
  const { context, worker } = session;
  const newTab = await openNewTab(session);
  await newTab.goto(`chrome-extension://${session.extensionId}/index.html#concepts`);
  await expect(newTab.getByText('No concepts yet')).toBeVisible();

  await seedDraft(worker, {
    kind: 'concept',
    text: 'Idempotence\nSame effect however many times it runs.',
    pageUrl: PAGE_URL,
    pageTitle: 'Glossary',
  });
  const popup = await openPopup(session);
  await expect(popup.getByLabel('Term')).toBeFocused();
  await popup.keyboard.type('Idempotency');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup.getByRole('button', { name: 'Saved' })).toBeVisible();

  const cards = await readStored<ConceptCard>(worker, 'conceptCards');
  expect(cards).toEqual([
    expect.objectContaining({
      term: 'Idempotency',
      definition: 'Same effect however many times it runs.',
      source: 'Glossary',
      sourceUrl: PAGE_URL,
    }),
  ]);
  await expect(newTab.getByText('Idempotency')).toBeVisible();
  expect(await worker.evaluate(() => chrome.storage.session.get('captureDraft'))).toEqual({});

  await context.close();
});

test('a captured quote is stored as a custom quote with its page', async () => {
  const session = await launchExtension();
  const { context, worker } = session;

  await seedDraft(worker, {
    kind: 'quote',
    text: 'Be yourself; everyone else is already taken.\n— Oscar Wilde',
    pageUrl: PAGE_URL,
    pageTitle: 'Wilde',
  });
  const popup = await openPopup(session);
  await expect(popup.getByLabel('Author')).toHaveValue('Oscar Wilde');
  await popup.getByLabel('Author').press('Enter');
  await expect(popup.getByRole('button', { name: 'Saved' })).toBeVisible();

  const quotes = await readStored<Quote>(worker, 'customQuotes');
  expect(quotes).toEqual([
    expect.objectContaining({
      text: 'Be yourself; everyone else is already taken.',
      author: 'Oscar Wilde',
      isCustom: true,
      sourceUrl: PAGE_URL,
    }),
  ]);

  await context.close();
});

test('the toolbar popup sizes to its content', async () => {
  const session = await launchExtension();
  const { context, worker } = session;
  const newTab = await openNewTab(session);
  await seedDraft(worker, {
    kind: 'concept',
    text: 'Idempotence\nSame effect however many times it runs.',
    pageUrl: PAGE_URL,
  });

  await newTab.evaluate(() => chrome.action.openPopup());

  await expect(async () => {
    const size = await newTab.evaluate(() => {
      const [popup] = chrome.extension.getViews({ type: 'popup' });
      const content = popup?.document.querySelector('main')?.getBoundingClientRect();
      return { width: popup?.innerWidth, height: popup?.innerHeight, content: content?.height };
    });
    expect(size.width).toBe(360);
    expect(size.content).toBeGreaterThan(200);
    expect(size.height).toBe(size.content);
  }).toPass({ timeout: 5_000 });

  await context.close();
});
