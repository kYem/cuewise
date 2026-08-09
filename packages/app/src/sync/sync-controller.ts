import type { SyncSession } from '@cuewise/shared';
import type {
  PairingPollResult,
  RecoveryEnvelopeState,
  SyncNowResult,
  SyncOutcome,
} from '@cuewise/sync-engine';
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
  /** Enrolled, but this device cannot read its key: recoverable with the recovery code. */
  | 'needs_enroll';

// Total by construction: a new SyncUiStatus member without an entry here is a compile error, so
// the validator below cannot silently start rejecting a status the rest of the app accepts.
const SYNC_UI_STATUSES: Record<SyncUiStatus, true> = {
  off: true,
  connecting: true,
  active: true,
  syncing: true,
  error: true,
  needs_reauth: true,
  needs_enroll: true,
};

/**
 * Narrows a value that crossed an untyped boundary — a host's own storage hands it back whatever
 * some other build wrote. Own properties only, so a stored `constructor` cannot pass.
 */
export function asSyncUiStatus(value: unknown): SyncUiStatus | null {
  if (typeof value === 'string' && Object.hasOwn(SYNC_UI_STATUSES, value)) {
    return value as SyncUiStatus;
  }
  return null;
}

export type EnableResult =
  | { ok: true; recoveryCode?: string }
  | {
      ok: false;
      reason: 'needs-code' | 'bad-code' | 'auth' | 'error' | 'cancelled';
      detail?: string;
      /** A code the abandoned attempt minted; the account it created outlives the attempt. */
      recoveryCode?: string;
    };

/**
 * EnableResult.detail marker for a deliberate cancel of the SIGN-IN itself; only meaningful beside
 * `reason:'auth'`, whose results carry no other detail. Hosts must only emit it when the cancel
 * signal is trustworthy — macOS's server-sanitized access_denied qualifies; the extension's
 * window-close message does NOT (Chromium reports closing a Google-side error page the same way).
 */
export const AUTH_CANCELLED_DETAIL = 'cancelled';

/**
 * Whether a failed enable was the user's own doing. Reads the reason, not just the detail: an
 * `error` detail is a thrown message, and one reading "cancelled" would silence a real failure.
 */
export function isCancelledEnable(result: Extract<EnableResult, { ok: false }>): boolean {
  if (result.reason === 'cancelled') {
    return true;
  }
  return result.reason === 'auth' && result.detail === AUTH_CANCELLED_DETAIL;
}

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
  /**
   * What is known about the server's recovery envelope. Absent when the extension's untyped
   * SW↔page wire came from a worker predating the field, which reads the same as `unknown`.
   */
  readonly recoveryEnvelope?: RecoveryEnvelopeState;
}

/** What a details lookup wants beyond the identity every caller shows. */
export interface SyncDetailsOptions {
  /**
   * Ask the server rather than report the last recorded answer. One extra request, so only the
   * surface that renders the finding — the settings panel's banner — turns it on (ENG-98).
   */
  readonly refreshRecoveryEnvelope?: boolean;
}

/**
 * Maps an engine account + last-synced timestamp into SyncDetails (null account ⇒ null), so both
 * host adapters (macOS in-process, extension SW) build the identical shape from one definition.
 */
export function buildSyncDetails(
  account: { userId: string; email: string | null } | null,
  lastSyncedAt: number | null,
  recoveryEnvelope: RecoveryEnvelopeState = 'unknown'
): SyncDetails | null {
  if (account === null) {
    return null;
  }
  return {
    accountEmail: account.email,
    accountId: account.userId,
    lastSyncedAt,
    recoveryEnvelope,
  };
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
  syncNow(): Promise<SyncNowResult>;
  /** Informational: resolves null when unavailable (signed out, offline, legacy host); never throws. */
  getDetails(options?: SyncDetailsOptions): Promise<SyncDetails | null>;
  /**
   * Live sessions on this account, for the signed-in devices list. Informational like getDetails:
   * resolves null when unavailable and never throws — a settings read that fails must not take the
   * panel down or trip the sign-in-expired path.
   */
  listSessions(): Promise<SyncSession[] | null>;
  /** Actions, unlike listSessions: these reject, so a failure can be told to the user. */
  revokeSession(id: string): Promise<void>;
  renameSession(id: string, deviceName: string): Promise<void>;
  /** Revokes every session but this one; resolves how many were cut. */
  revokeOtherSessions(): Promise<number>;
  /**
   * The last cycle's outcome, or null if none has run — wrapped so a host that could not read it
   * (dead worker, timeout, skewed response) answers LAST_CYCLE_UNAVAILABLE instead of a null that
   * reads as "no cycle". Informational; never throws. Async because the extension's implementation
   * crosses a realm boundary; macOS reads it synchronously from the engine and resolves.
   */
  getLastCycle(): Promise<LastCycleRead>;
  /**
   * Starts a device-pairing request (ENG-50) so a device that already holds the key can approve
   * this one. Null when this device cannot pair right now — it already has a key, an enroll is
   * mid-flight, or the session that would carry the request is gone.
   */
  beginPairing(): Promise<{ pairingId: string } | null>;
  /**
   * One poll of the request beginPairing started; the requester screen loops it while it is up.
   * Never throws — a fault is answered as `failed`, and every `failed` is terminal.
   */
  pollPairing(): Promise<PairingPollResult>;
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
