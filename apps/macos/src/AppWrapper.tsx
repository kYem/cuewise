import { App, type SettingsSection } from '@cuewise/app';
import type { ReactElement } from 'react';
import { PostureSettingsSection } from './posture/PostureSettingsSection';

const POSTURE_SECTIONS: SettingsSection[] = [PostureSettingsSection];

/**
 * Mounts the shared App, injecting the macOS-only Posture settings section — but
 * only under Tauri. In the web / e2e build there's no sidecar, so we inject
 * nothing and the section (with its `@tauri-apps` calls) never renders.
 */
export function AppWrapper(): ReactElement {
  const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return <App extraSections={inTauri ? POSTURE_SECTIONS : undefined} />;
}
