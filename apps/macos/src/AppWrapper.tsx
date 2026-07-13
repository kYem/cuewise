import { App, type SettingsSection } from '@cuewise/app';
import type { ReactElement } from 'react';
import { PostureChip } from './posture/PostureChip';
import { PostureSettingsSection } from './posture/PostureSettingsSection';

const POSTURE_SECTIONS: SettingsSection[] = [PostureSettingsSection];

/**
 * Mounts the shared App, injecting the macOS-only Posture settings section and
 * ambient status chip — but only under Tauri. In the web / e2e build there's no
 * sidecar, so neither (with their `@tauri-apps` calls) ever renders.
 */
export function AppWrapper(): ReactElement {
  const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return (
    <>
      <App extraSections={inTauri ? POSTURE_SECTIONS : undefined} />
      {inTauri ? <PostureChip /> : null}
    </>
  );
}
