import {
  App,
  createNotionSettingsSection,
  type NotionHost,
  type SettingsSection,
  type SyncController,
} from '@cuewise/app';
import { type ReactElement, useMemo } from 'react';
import { PostureChip } from './posture/PostureChip';
import { PostureSettingsSection } from './posture/PostureSettingsSection';

interface AppWrapperProps {
  /** DirectSyncController (Task 9), present only when VITE_SYNC_API_BASE_URL is set. */
  syncController?: SyncController | null;
  /** Present only when sync is configured and the build carries a Notion client id. */
  notionHost?: NotionHost;
}

/**
 * Mounts the shared App with the host's settings sections. Posture and its chip render only under
 * Tauri, since they call the sidecar; Notion renders whenever main.tsx supplied a host.
 */
export function AppWrapper({ syncController, notionHost }: AppWrapperProps = {}): ReactElement {
  const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const extraSections = useMemo(() => {
    const sections: SettingsSection[] = [];
    if (inTauri) {
      sections.push(PostureSettingsSection);
    }
    if (notionHost !== undefined) {
      sections.push(createNotionSettingsSection(notionHost));
    }
    return sections.length > 0 ? sections : undefined;
  }, [inTauri, notionHost]);
  return (
    <>
      <App extraSections={extraSections} syncController={syncController} notionHost={notionHost} />
      {inTauri ? <PostureChip /> : null}
    </>
  );
}
