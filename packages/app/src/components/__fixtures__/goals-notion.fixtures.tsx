import { render } from '@testing-library/react';
import type { NotionHost } from '../../notion/notion-host';
import { FakeSyncController } from '../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext, type SyncUiStatus } from '../../sync/sync-controller';
import { GoalsSection } from '../GoalsSection';

export function renderGoalsWithNotion(
  host: NotionHost | undefined,
  options: { status?: SyncUiStatus; onOpenIntegrations?: () => void } = {}
) {
  const controller = new FakeSyncController();
  controller.setStatus(options.status ?? 'active');
  return render(
    <SyncControllerContext.Provider value={controller}>
      <GoalsSection notionHost={host} onOpenIntegrations={options.onOpenIntegrations} />
    </SyncControllerContext.Provider>
  );
}
