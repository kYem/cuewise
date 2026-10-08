import { render } from '@testing-library/react';
import type React from 'react';
import type { NotionHost } from '../../notion/notion-host';
import { LiveIds } from '../../shortcuts/__fixtures__/shortcuts.fixtures';
import { ShortcutProvider } from '../../shortcuts/ShortcutProvider';
import { FakeSyncController } from '../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext, type SyncUiStatus } from '../../sync/sync-controller';
import { GoalsSection } from '../GoalsSection';

interface GoalsWithNotionOptions {
  status?: SyncUiStatus;
  onOpenIntegrations?: () => void;
  shortcuts?: boolean;
}

/**
 * The section as the app mounts it. Returns a builder: re-rendering needs a fresh element, since
 * React skips an identical one.
 */
export function goalsWithNotion(
  host: NotionHost | undefined,
  options: GoalsWithNotionOptions = {}
): () => React.ReactElement {
  const controller = new FakeSyncController();
  controller.setStatus(options.status ?? 'active');
  return () => {
    const section = (
      <SyncControllerContext.Provider value={controller}>
        <GoalsSection notionHost={host} onOpenIntegrations={options.onOpenIntegrations} />
      </SyncControllerContext.Provider>
    );
    if (options.shortcuts) {
      return (
        <ShortcutProvider>
          {section}
          <LiveIds />
        </ShortcutProvider>
      );
    }
    return section;
  };
}

export function renderGoalsWithNotion(
  host: NotionHost | undefined,
  options: GoalsWithNotionOptions = {}
) {
  return render(goalsWithNotion(host, options)());
}
