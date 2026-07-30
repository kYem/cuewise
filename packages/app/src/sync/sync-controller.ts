import type { SyncOutcome } from '@cuewise/sync-engine';
import { createContext, useContext } from 'react';

/**
 * UI-owned sync status — distinct from the engine's own status; host adapters map one to the other.
 * `'syncing'` is adapter-optional: only hosts that report it emit it (macOS does; the extension bridge never does).
 */
export type SyncUiStatus =
  | 'off'
  | 'connecting'
  | 'active'
  | 'syncing'
  | 'error'
  | 'needs_reauth'
  /** Enrolled, but this device's key is gone: recoverable only with the recovery code. */
  | 'needs_enroll';

export type EnableResult =
  | { ok: true; recoveryCode?: string }
  | { ok: false; reason: 'needs-code' | 'bad-code' | 'auth' | 'error'; detail?: string };

/**
 * EnableResult.detail marker for a deliberate user cancel; the UI goes quiet on it (no toast,
 * no error state). Hosts must only emit it when the cancel signal is trustworthy — macOS's
 * server-sanitized access_denied qualifies; the extension's window-close message does NOT
 * (Chromium reports closing a Google-side error page the same way).
 */
export const AUTH_CANCELLED_DETAIL = 'cancelled';

/**
 * A last-cycle read. `{available:false}` is NOT `{available:true, outcome:null}`: only the latter
 * means "the engine has run no cycle", and only it may clear a badge a previous read painted.
 */
export type LastCycleRead =
  | { readonly available: true; readonly outcome: SyncOutcome | null }
  | { readonly available: false };

/** The one "I could not read the cycle" value, so no caller invents a second spelling. */
export const LAST_CYCLE_UNAVAILABLE: LastCycleRead = { available: false };

/** Account + freshness info for the settings UI ("Signed in as … · Last synced …"). */
export interface SyncDetails {
  /** Provider-verified email, or null when none exists (e.g. the dev provider). */
  readonly accountEmail: string | null;
  readonly accountId: string;
  /** Millis of the last successful sync cycle; null before the first one is known. */
  readonly lastSyncedAt: number | null;
}

/**
 * Maps an engine account + last-synced timestamp into SyncDetails (null account ⇒ null), so both
 * host adapters (macOS in-process, extension SW) build the identical shape from one definition.
 */
export function buildSyncDetails(
  account: { userId: string; email: string | null } | null,
  lastSyncedAt: number | null
): SyncDetails | null {
  if (account === null) {
    return null;
  }
  return { accountEmail: account.email, accountId: account.userId, lastSyncedAt };
}

/**
 * Platform-agnostic seam the enable-sync UI drives; host adapters (macOS/extension) implement it.
 *
 * Capability convention: a capability every host can answer, but whose answer depends on build/env
 * config, is a required `canX(): boolean` (canEnableWithGoogle — the extension's answer tracks its
 * googleClientId env var). A capability that not every host provides is an optional method the UI
 * feature-detects by presence — either because the host cannot (cancelEnableWithGoogle: the
 * extension's popup flow has no abort seam) or because it deliberately declines as unnecessary
 * (enrollWithCode: the extension's re-auth is cheap enough that the fallback path suffices).
 */
export interface SyncController {
  getStatus(): SyncUiStatus;
  subscribe(cb: (status: SyncUiStatus) => void): () => void;
  enable(accountId: string, deviceName: string, recoveryCode?: string): Promise<EnableResult>;
  /** Google OAuth sign-in; the host adapter owns the OAuth flow and the credential exchange. */
  enableWithGoogle(deviceName: string, recoveryCode?: string): Promise<EnableResult>;
  /** Whether Google sign-in is available on this host/build; the UI hides the button when false. */
  canEnableWithGoogle(): boolean;
  reconnect(recoveryCode?: string): Promise<EnableResult>;
  disable(): Promise<void>;
  regenerateRecoveryCode(): Promise<string>;
  syncNow(): Promise<SyncOutcome>;
  /** Informational: resolves null when unavailable (signed out, offline, legacy host); never throws. */
  getDetails(): Promise<SyncDetails | null>;
  /**
   * The last cycle's outcome, or null if none has run — wrapped so a host that could not read it
   * (dead worker, timeout, skewed response) answers LAST_CYCLE_UNAVAILABLE instead of a null that
   * reads as "no cycle". Informational; never throws. Async because the extension's implementation
   * crosses a realm boundary; macOS reads it synchronously from the engine and resolves.
   */
  getLastCycle(): Promise<LastCycleRead>;
  /**
   * Aborts a pending enableWithGoogle flow (the pending result resolves as a quiet cancel).
   * Only hosts whose OAuth flow can be aborted implement it (macOS system-browser); the UI
   * shows a Cancel affordance only when present — the extension's popup is user-closable.
   */
  cancelEnableWithGoogle?(): void;
  /**
   * Finishes a device-#2 enroll that stopped at needs-code by supplying the recovery code
   * against the STILL-LIVE session, with no second browser bounce. Hosts whose sign-in re-auth
   * is cheap (the extension popup) may omit it; the UI falls back to the full re-auth path.
   */
  enrollWithCode?(deviceName: string, recoveryCode: string): Promise<EnableResult>;
}

export const SyncControllerContext = createContext<SyncController | null>(null);

/** Returns the SyncController from context, or null outside a provider (e.g. sync disabled/unmounted host). */
export function useSyncController(): SyncController | null {
  return useContext(SyncControllerContext);
}
