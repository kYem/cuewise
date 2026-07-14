import { App, type SettingsSection, type SyncController } from '@cuewise/app';
import type { ReactElement } from 'react';
import { PostureChip } from './posture/PostureChip';
import { PostureSettingsSection } from './posture/PostureSettingsSection';

const POSTURE_SECTIONS: SettingsSection[] = [PostureSettingsSection];

interface AppWrapperProps {
  /** DirectSyncController (Task 9), present only when VITE_SYNC_API_BASE_URL is set. */
  syncController?: SyncController | null;
}

/**
 * Mounts the shared App, injecting the macOS-only Posture settings section and
 * ambient status chip — but only under Tauri. In the web / e2e build there's no
 * sidecar, so neither (with their `@tauri-apps` calls) ever renders.
 */
export function AppWrapper({ syncController }: AppWrapperProps = {}): ReactElement {
  const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return (
    <>
      <App extraSections={inTauri ? POSTURE_SECTIONS : undefined} syncController={syncController} />
      {inTauri ? <PostureChip /> : null}
    </>
  );
}
