import { defaultSettings } from '@cuewise/test-utils';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { NotionHost } from '../../../notion/notion-host';
import { FakeSyncController } from '../../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext, type SyncUiStatus } from '../../../sync/sync-controller';
import { createNotionSettingsSection } from '../NotionSettingsSection';

export function renderNotionSection(host: NotionHost, status: SyncUiStatus = 'active') {
  const controller = new FakeSyncController();
  controller.setStatus(status);
  const Section = createNotionSettingsSection(host).component;
  const rendered = render(
    <SyncControllerContext.Provider value={controller}>
      <Section
        s={defaultSettings}
        set={vi.fn()}
        filter=""
        onReset={vi.fn()}
        onOpenSoundsPanel={vi.fn()}
      />
    </SyncControllerContext.Provider>
  );
  return { controller, ...rendered };
}
