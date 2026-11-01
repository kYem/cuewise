import { type QuickLink, quickLinkSchema, STORAGE_KEYS } from '@cuewise/shared';
import {
  getValidatedListFromStorage,
  type StorageResult,
  setValidatedListInStorage,
} from './chrome-storage';
import { getStorageArea } from './settings';

// Quick Links (pinned shortcut tiles on the new tab)
export async function getQuickLinks(): Promise<QuickLink[]> {
  const area = await getStorageArea();
  const links = await getValidatedListFromStorage<QuickLink>(
    STORAGE_KEYS.QUICK_LINKS,
    quickLinkSchema,
    area
  );
  return links ?? [];
}

export async function setQuickLinks(links: QuickLink[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.QUICK_LINKS, links, quickLinkSchema, area);
}
