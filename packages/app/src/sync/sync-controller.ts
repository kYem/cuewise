import { createContext, useContext } from 'react';

/**
 * UI-owned sync status — distinct from the engine's own status; host adapters map one to the other.
 * `'syncing'` is adapter-optional: only hosts that report it emit it transiently around their own
 * syncNow() (macOS does; the extension bridge path never does).
 */
export type SyncUiStatus = 'off' | 'connecting' | 'active' | 'syncing' | 'error' | 'needs_reauth';

export type EnableResult =
  | { ok: true; recoveryCode?: string }
  | { ok: false; reason: 'needs-code' | 'bad-code' | 'auth' | 'error'; detail?: string };

/** Platform-agnostic seam the enable-sync UI drives; host adapters (macOS/extension) implement it. */
export interface SyncController {
  getStatus(): SyncUiStatus;
  subscribe(cb: (status: SyncUiStatus) => void): () => void;
  enable(accountId: string, deviceName: string, recoveryCode?: string): Promise<EnableResult>;
  reconnect(recoveryCode?: string): Promise<EnableResult>;
  disable(): Promise<void>;
  regenerateRecoveryCode(): Promise<string>;
  syncNow(): Promise<void>;
}

export const SyncControllerContext = createContext<SyncController | null>(null);

/** Returns the SyncController from context, or null outside a provider (e.g. sync disabled/unmounted host). */
export function useSyncController(): SyncController | null {
  return useContext(SyncControllerContext);
}
