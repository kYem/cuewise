import { render } from '@testing-library/react';
import type { NotionHost } from '../../notion/notion-host';
import { LiveIds } from '../../shortcuts/__fixtures__/shortcuts.fixtures';
import { ShortcutProvider } from '../../shortcuts/ShortcutProvider';
import { FakeSyncController } from '../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext, type SyncUiStatus } from '../../sync/sync-controller';
import { GoalsSection } from '../GoalsSection';

export function renderGoalsWithNotion(
  host: NotionHost | undefined,
  options: { status?: SyncUiStatus; onOpenIntegrations?: () => void; shortcuts?: boolean } = {}
) {
  const controller = new FakeSyncController();
  controller.setStatus(options.status ?? 'active');
  const section = (
    <SyncControllerContext.Provider value={controller}>
      <GoalsSection notionHost={host} onOpenIntegrations={options.onOpenIntegrations} />
    </SyncControllerContext.Provider>
  );
  if (options.shortcuts) {
    return render(
      <ShortcutProvider>
        {section}
        <LiveIds />
      </ShortcutProvider>
    );
  }
  return render(section);
}
