import { describeThrown, logger } from '@cuewise/shared';
import type { SyncFailureReason, SyncNowResult, SyncOutcome } from '@cuewise/sync-engine';
import { cn } from '@cuewise/ui';
import { AlertTriangle, CloudUpload, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useToastStore } from '../../stores/toast-store';
import type {
  EnableResult,
  LastCycleRead,
  SyncDetails,
  SyncDetailsOptions,
  SyncUiStatus,
} from '../../sync/sync-controller';
import {
  AUTH_CANCELLED_DETAIL,
  isCancelledEnable,
  LAST_CYCLE_UNAVAILABLE,
  useSyncController,
} from '../../sync/sync-controller';
import { formatMillisAgo } from '../../utils/reminder-date-utils';
import { ConfirmationDialog } from '../ConfirmationDialog';
import { EnrollCodeModal } from './EnrollCodeModal';
import { PairingPanel } from './PairingPanel';
import { RecoveryCodeModal } from './RecoveryCodeModal';
import { SessionList } from './SessionList';
import { SettingRow, SettingSubgroup, Switch } from './SettingControls';
import type { SettingsSection } from './SettingsSections';
import { settingsMatch } from './settings-match';
import type { SettingsSectionProps } from './settings-types';

const SEARCH_TERMS = 'cloud sync encrypted end-to-end recovery code account device backup';

// The one surface that renders the "no recovery code" finding, so the one that pays to refresh it.
const WITH_ENVELOPE: SyncDetailsOptions = { refreshRecoveryEnvelope: true };

/** The standard four-color "G" mark — kept local since lucide-react has no brand icons. */
const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
    />
  </svg>
);

/** What a status puts on screen. A pill and a prompt are alternatives, never both. */
type StatusPresentation =
  | { readonly kind: 'quiet' }
  | { readonly kind: 'pill'; readonly label: string }
  | { readonly kind: 'reconnect'; readonly prompt: string }
  /** Same explanation, but the fix is another device approving this one (ENG-50). */
  | { readonly kind: 'pairing'; readonly prompt: string };

const QUIET: StatusPresentation = { kind: 'quiet' };

// Total: a new SyncUiStatus without a presentation is a compile error. `needs_enroll` is quiet of
// pill on purpose — without a key, Sync now and Regenerate both fail; `error` has its own block.
const STATUS_PRESENTATION_BY_STATUS: Record<SyncUiStatus, StatusPresentation> = {
  off: QUIET,
  connecting: { kind: 'pill', label: 'Connecting…' },
  syncing: { kind: 'pill', label: 'Syncing…' },
  active: { kind: 'pill', label: 'Active' },
  error: QUIET,
  needs_reauth: { kind: 'reconnect', prompt: 'Sign-in expired — reconnect to keep syncing.' },
  // "can't read" rather than "is missing": a transient read failure reaches this status too. The
  // panel below says what to do about it, so this line only names the state.
  needs_enroll: {
    kind: 'pairing',
    prompt: "This device can't read its encryption key, so nothing can sync.",
  },
};

// Belt and braces, not a live path: every host validates before setStatus, so an unknown member
// would have to come from a future adapter. The literal stays total, so adding one still compiles.
const STATUS_PRESENTATION: Partial<Record<SyncUiStatus, StatusPresentation>> =
  STATUS_PRESENTATION_BY_STATUS;

// Only `network` promises a full recovery, because it is the only reason where that promise is
// true. `device` is also the bucket for anything unrecognised, so it claims no cause and no cure —
// only the retry that actually happens (the status stays active; the wake retries every 5 min).
// Total on purpose: a new SyncFailureReason without copy here is a compile error, never a silent
// fall back to the generic line.
const FAILURE_MESSAGE: Record<SyncFailureReason, string> = {
  network:
    "Can't reach Cloud Sync. Your data is safe on this device and will sync when you're back online.",
  server: 'Cloud Sync is having trouble. This device will keep retrying.',
  device:
    "Cloud Sync couldn't finish on this device. Your data is safe here and it will keep retrying.",
};

const INCOMPLETE_MESSAGE = "Sync didn't complete — your data is safe on this device.";

// The modal's one quiet outcome — no error line, no toast (see isCancelledEnable). Returned when
// a pairing has already enrolled the device, so the typed code's late answer is moot.
const PAIRING_ALREADY_ENROLLED: EnableResult = {
  ok: false,
  reason: 'auth',
  detail: AUTH_CANCELLED_DETAIL,
};

// Widened once: `reason` crosses an untrusted wire, so a skewed peer's unknown value must fall
// back rather than paint an empty badge.
const KNOWN_FAILURE_MESSAGE: Partial<Record<SyncFailureReason, string>> = FAILURE_MESSAGE;

function failureMessage(reason: SyncFailureReason): string {
  return KNOWN_FAILURE_MESSAGE[reason] ?? INCOMPLETE_MESSAGE;
}

// Called wherever an outcome arrives, never from failureMessage — render calls that every paint.
// Without it the fallback copy is indistinguishable from a genuine no-key/resynced/signed-out one.
function logUnrecognisedReason(outcome: SyncNowResult | null): void {
  if (outcome === null || outcome.kind !== 'failed') {
    return;
  }
  if (KNOWN_FAILURE_MESSAGE[outcome.reason] === undefined) {
    logger.error(`Cloud sync reported an unrecognised failure reason: ${outcome.reason}`);
  }
}

/**
 * `unknown` carries the last known outcome: an unreadable read says nothing about it, so a failure
 * already on screen must survive one. That carry-forward holds within one account — see
 * adoptNewAccount.
 */
type PanelCycle =
  | { readonly kind: 'none' }
  | { readonly kind: 'outcome'; readonly outcome: SyncOutcome }
  | { readonly kind: 'unknown'; readonly lastKnown: SyncOutcome | null };

const CYCLE_NONE: PanelCycle = { kind: 'none' };

/** What a value knows about the last cycle that actually ran. */
function knownOutcome(cycle: PanelCycle): SyncOutcome | null {
  if (cycle.kind === 'outcome') {
    return cycle.outcome;
  }
  if (cycle.kind === 'unknown') {
    return cycle.lastKnown;
  }
  return null;
}

// Must stay pure: it runs inside a setState updater, which StrictMode double-invokes. Anything
// with an effect belongs in adoptRead below.
function nextPanelCycle(previous: PanelCycle, read: LastCycleRead): PanelCycle {
  if (!read.available) {
    return { kind: 'unknown', lastKnown: knownOutcome(previous) };
  }
  if (read.outcome === null) {
    return CYCLE_NONE;
  }
  return { kind: 'outcome', outcome: read.outcome };
}

/** The one way a read reaches the panel: logs once, then folds. */
function adoptRead(read: LastCycleRead, setCycle: Dispatch<SetStateAction<PanelCycle>>): void {
  if (read.available) {
    logUnrecognisedReason(read.outcome);
  }
  setCycle((previous) => nextPanelCycle(previous, read));
}

// Regenerate cannot fix this one — the abandoned enrol dropped the key it would need.
const ABANDONED_CODE_MESSAGE =
  'Cloud Sync was disconnected before setup finished. Save this recovery code — it is the only way back into the account it had already created.';

// h-4 is text-xs's line-height, so the placeholder occupies exactly the row the account line
// will: the buttons below it don't move when the details fetch lands.
const ACCOUNT_SKELETON_ROW = 'flex h-4 items-center';

const DISABLE_MESSAGE = 'Re-enabling on this device will need your recovery code.';
const DISABLE_MESSAGE_UNSAVED =
  "You haven't saved your recovery code yet — regenerate and save one first, or you may lose access when you re-enable this device.";

// Short device label from the UA string; falls back when nothing recognizable matches.
function deriveDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const patterns: [RegExp, string][] = [
    [/iPad/i, 'iPad'],
    [/iPhone/i, 'iPhone'],
    [/Android/i, 'Android device'],
    [/Macintosh/i, 'Mac'],
    [/Windows/i, 'Windows PC'],
    [/Linux/i, 'Linux device'],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(ua)) {
      return label;
    }
  }
  return 'This device';
}

function enableFailureMessage(result: Extract<EnableResult, { ok: false }>): string {
  if (result.reason === 'bad-code') {
    return "That recovery code didn't work — please check it and try again.";
  }
  if (result.reason === 'auth') {
    return "Couldn't verify your account — please try again.";
  }
  return 'Something went wrong enabling sync — please try again.';
}

function pillClass(status: SyncUiStatus): string {
  if (status === 'active') {
    return 'inline-flex w-fit items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success';
  }
  return 'inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-variant px-2.5 py-1 text-xs font-medium text-secondary';
}

// Cloud Sync and legacy Chrome sync must never both replicate the same data, so activating Cloud
// Sync hands off from Chrome sync: turn it off, migrating any chrome.storage.sync data back to
// local. Called only AFTER a sign-in succeeds, so a cancelled/failed attempt leaves Chrome sync
// untouched; the engine keeps its metadata in local regardless, so this post-success migration is
// consistent. A no-op when Chrome sync is already off (the default, and on local-only hosts).
async function takeOverFromChromeSync(): Promise<void> {
  const store = useSettingsStore.getState();
  if (!store.settings.syncEnabled) {
    return;
  }
  const persisted = await store.updateSettings({ syncEnabled: false });
  if (!persisted) {
    // Cloud Sync is already live by this point — the takeover is what failed, so there is nothing
    // to roll back; the user has to finish it by hand or both backends replicate.
    logger.error('Cloud sync enabled but Chrome sync could not be turned off — both may replicate');
    useToastStore
      .getState()
      .warning(
        'Cloud Sync is on, but Chrome sync could not be turned off — turn it off in Settings.'
      );
  }
}

export const SyncSettingsSectionComponent: React.FC<SettingsSectionProps> = ({ filter }) => {
  const controller = useSyncController();
  const [status, setStatus] = useState<SyncUiStatus>(() => controller?.getStatus() ?? 'off');
  const [enabling, setEnabling] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [deviceName, setDeviceName] = useState(deriveDeviceName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Gates the Sync now button: two overlapping cycles would each toast, and the badge would belong
  // to whichever finished last rather than the newest click.
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  // Which flow opened EnrollCodeModal — reconnect reuses persisted creds; enable/google re-run
  // that same sign-in with the entered code (google re-auths for a fresh id token).
  const [enrollSource, setEnrollSource] = useState<'enable' | 'google' | 'reconnect'>('enable');
  // Whether the modal opens on the code input: true only when the screen behind it already
  // offered pairing, so the same offer is not made twice.
  const [enrollCodeFirst, setEnrollCodeFirst] = useState(false);
  // Covers ONE pairing completion, and only until something ends it: any status change (the enrol
  // became visible, or this device is keyless again) or a new enroll attempt starting. It exists
  // because both hosts report status asynchronously — the extension's arrives over a storage
  // broadcast — so in that gap nothing else knows this device already has its key.
  const [pairedEnroll, setPairedEnroll] = useState(false);
  // Beside the state because a submission that resolves later reads it from a stale closure.
  const pairedEnrollRef = useRef(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [unsavedCode, setUnsavedCode] = useState(false);
  // The error state's "Try again" retries the exact action that failed (enable / google /
  // reconnect) — syncNow can't recover it and would falsely report success.
  const [failedAction, setFailedAction] = useState<'enable' | 'google' | 'reconnect'>('enable');
  // The macOS google flow can take minutes; if Settings closes meanwhile, a late recovery code
  // has no modal to render into — the ref routes it to a global toast instead of vanishing.
  const mountedRef = useRef(true);
  // "Signed in as … · Last synced …" — fetched once per mount when sync is first seen running.
  const [details, setDetails] = useState<SyncDetails | null>(null);
  // Only the mount fetch sets this — syncNow's refresh keeps the stale line rather than
  // replacing a real identity with a skeleton.
  const [detailsPending, setDetailsPending] = useState(false);
  const detailsRequestedRef = useRef(false);
  // Bumped whenever a details fetch starts or is invalidated (disable). A resolution whose
  // generation is stale is dropped, so a slow fetch for a prior account can't clobber a newer
  // one after disable→re-enable, and syncNow's refresh can't lose a race with the mount fetch.
  const detailsGenRef = useRef(0);
  // What the last cycle did. Reads are guarded by lastCycleGenRef, a click's paint by accountGenRef.
  const [cycle, setCycle] = useState<PanelCycle>(CYCLE_NONE);
  // Which account the panel shows; a disable or a successful (re)connect moves it. Separate from
  // the read counter, which any status transition bumps — that must not silence a click.
  const accountGenRef = useRef(0);
  const lastCycleGenRef = useRef(0);
  const lastCycleRequestedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Any status change ends the window, in either direction: active/syncing means the enrol this
  // covered is visible now, off/needs_enroll that the device is keyless again. The window itself is
  // precisely the stretch where no change has arrived yet.
  useEffect(() => {
    pairedEnrollRef.current = false;
    setPairedEnroll(false);
  }, [status]);

  useEffect(() => {
    if (!controller || detailsRequestedRef.current) {
      return;
    }
    if (status !== 'active' && status !== 'syncing') {
      return;
    }
    detailsRequestedRef.current = true;
    detailsGenRef.current += 1;
    const gen = detailsGenRef.current;
    setDetailsPending(true);
    controller.getDetails(WITH_ENVELOPE).then(
      (result) => {
        if (detailsGenRef.current !== gen) {
          // Superseded by a disable or a newer fetch — this account is no longer current.
          return;
        }
        setDetailsPending(false);
        if (result === null) {
          // Transient miss (e.g. the fetch queued behind a long initial sync and timed out) —
          // re-arm so the next status transition retries instead of blanking the whole mount.
          detailsRequestedRef.current = false;
          return;
        }
        setDetails(result);
      },
      (error) => {
        // getDetails is contracted never to reject; if a host adapter breaks that, treat it as
        // the null branch — log, and (when still current) re-arm so a later transition retries
        // rather than latching details off for the whole mount.
        logger.warn(
          `Cloud sync details unavailable: ${error instanceof Error ? error.message : String(error)}`
        );
        if (detailsGenRef.current === gen) {
          setDetailsPending(false);
          detailsRequestedRef.current = false;
        }
      }
    );
  }, [controller, status]);

  useEffect(() => {
    if (!controller || lastCycleRequestedRef.current) {
      return;
    }
    lastCycleRequestedRef.current = true;
    lastCycleGenRef.current += 1;
    const gen = lastCycleGenRef.current;
    controller.getLastCycle().then(
      (read) => {
        if (lastCycleGenRef.current !== gen) {
          return;
        }
        adoptRead(read, setCycle);
        if (!read.available) {
          // An unreadable read (asleep worker, timeout) is a transient miss like the details one —
          // re-arm so the next status transition retries instead of latching the badge off.
          lastCycleRequestedRef.current = false;
        }
      },
      (error) => {
        // Contracted never to reject; a host that breaks that gets the same answer as an
        // unreadable read rather than a quieter one, so both paths say "couldn't check".
        logger.error(`Cloud sync last cycle unavailable: ${describeThrown(error)}`, error);
        if (lastCycleGenRef.current === gen) {
          adoptRead(LAST_CYCLE_UNAVAILABLE, setCycle);
          lastCycleRequestedRef.current = false;
        }
      }
    );
  }, [controller, status]);

  useEffect(() => {
    if (!controller) {
      return undefined;
    }
    setStatus(controller.getStatus());
    return controller.subscribe(setStatus);
  }, [controller]);

  if (!controller) {
    return null;
  }
  if (!settingsMatch(filter, SEARCH_TERMS)) {
    return null;
  }

  // A show-once recovery code must never vanish: if Settings closed during a slow OAuth flow,
  // the modal has no mount — tell the user (globally) to regenerate one instead. Recoverable:
  // the code grants nothing by itself and Regenerate mints a fresh one.
  const surfaceRecoveryCode = (code: string) => {
    if (mountedRef.current) {
      setRecoveryCode(code);
      return;
    }
    logger.error('Cloud sync enabled after Settings closed — the recovery code had no surface');
    useToastStore
      .getState()
      .warning('Cloud sync is on — open Settings → Cloud Sync and regenerate your recovery code.');
  };

  // Enable finishes at `active` even when its initial cycle failed, and that cycle involves no
  // click and no status the panel branches on — without this re-read, enabling while offline shows
  // Active with nothing explaining the missing "Last synced".
  const refreshLastCycle = async () => {
    lastCycleGenRef.current += 1;
    const gen = lastCycleGenRef.current;
    const read = await controller.getLastCycle().catch((error) => {
      logger.error(`Cloud sync last cycle unavailable: ${describeThrown(error)}`, error);
      return LAST_CYCLE_UNAVAILABLE;
    });
    if (lastCycleGenRef.current !== gen) {
      return;
    }
    adoptRead(read, setCycle);
    if (!read.available) {
      lastCycleRequestedRef.current = false;
    }
  };

  // No default: a caller that just WROTE the envelope wants the recorded answer, and `undefined`
  // picking up a default would send it asking instead.
  const refreshDetails = async (options: SyncDetailsOptions | undefined) => {
    detailsGenRef.current += 1;
    const gen = detailsGenRef.current;
    const next = await controller.getDetails(options).catch((error) => {
      logger.error(`Cloud sync details unavailable: ${describeThrown(error)}`, error);
      return null;
    });
    if (detailsGenRef.current === gen && next !== null) {
      setDetails(next);
    }
  };

  // One writer for both halves, so the ref a late submission reads can never disagree with the
  // state the pairing panel's gate reads.
  const latchPairedEnroll = (paired: boolean) => {
    pairedEnrollRef.current = paired;
    setPairedEnroll(paired);
  };

  // Every path that lands on a new account: a reconnect can land on a DIFFERENT one, so an in-flight
  // click must stop being able to paint or toast for the previous one, and both shown facts re-read.
  const adoptNewAccount = async () => {
    accountGenRef.current += 1;
    detailsRequestedRef.current = false;
    // Cleared first, like handleDisable: if the re-read below cannot answer, the carry-forward
    // would hand this account the previous one's failure.
    setCycle(CYCLE_NONE);
    await refreshLastCycle();
    await refreshDetails(WITH_ENVELOPE);
  };

  // A disconnect landed mid-enable, so the switch must stop reading on.
  const routeAbandonedEnable = (recoveryCode: string | undefined) => {
    setEnabling(false);
    // The enroll modal is a prompt to finish joining an account this device is no longer joining;
    // left open, its Enroll button starts a fresh sign-in for it.
    setEnrollOpen(false);
    if (recoveryCode === undefined) {
      // Nothing minted means nothing outlives the attempt: the user's own action, not a fault.
      logger.info('Cloud sync enable was abandoned by a disconnect');
      return;
    }
    logger.error('Cloud sync enable was abandoned after creating an account on the server');
    if (mountedRef.current) {
      surfaceRecoveryCode(recoveryCode);
      useToastStore.getState().warning(ABANDONED_CODE_MESSAGE);
      return;
    }
    // No modal to render into, and Regenerate cannot mint a replacement, so the code itself has
    // to travel in the message — and it must not time out like an ordinary toast.
    logger.error('Cloud sync issued a recovery code after Settings closed — it went to a toast');
    useToastStore
      .getState()
      .warning(`${ABANDONED_CODE_MESSAGE} ${recoveryCode}`, { duration: Number.POSITIVE_INFINITY });
  };

  // Shared by the initial enable() and the reconnect() flows — both surface the same shape.
  // source records which flow needs a code, so the EnrollCodeModal submit routes back correctly.
  const routeEnableResult = async (
    result: EnableResult,
    source: 'enable' | 'google' | 'reconnect'
  ) => {
    if (result.ok) {
      // Cloud Sync is now active — hand off from legacy Chrome sync (see takeOverFromChromeSync).
      await takeOverFromChromeSync();
      await adoptNewAccount();
      setEnabling(false);
      if (result.recoveryCode) {
        surfaceRecoveryCode(result.recoveryCode);
      }
      return;
    }
    if (result.reason === 'needs-code') {
      // Device #2 of an existing account: EnrollCodeModal leads with pairing and collects the
      // recovery code behind it, re-running this same sign-in method with what was typed. A
      // brand-new account (device #1) never needs a code.
      setEnrollSource(source);
      setEnrollCodeFirst(false);
      // A new attempt: whatever a previous pairing did, this one's answers are its own.
      latchPairedEnroll(false);
      setEnrollOpen(true);
      return;
    }
    if (result.reason === 'cancelled') {
      routeAbandonedEnable(result.recoveryCode);
      return;
    }
    if (isCancelledEnable(result)) {
      // A cancelled sign-in isn't a failure: no error state, no toast; the form stays open for
      // another attempt, unlike the disconnect above, which ended this device's setup.
      logger.info(`Cloud sync ${source} sign-in was cancelled by the user`);
      return;
    }
    setFailedAction(source);
    // Log the cause as a string, not an object arg: string-coercing surfaces (Chrome's extension
    // Errors panel, log aggregators) render an object as "[object Object]".
    logger.error(
      `Cloud sync ${source} failed — reason=${result.reason}, detail=${result.detail ?? 'none'}`
    );
    useToastStore.getState().error(enableFailureMessage(result));
  };

  const handleEnable = async () => {
    setIsSubmitting(true);
    try {
      const result = await controller.enable(accountId, deviceName);
      await routeEnableResult(result, 'enable');
    } catch (error) {
      logger.error('Cloud sync enable failed', error);
      useToastStore.getState().error('Something went wrong enabling sync — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSigningIn(true);
    try {
      const result = await controller.enableWithGoogle(deviceName);
      await routeEnableResult(result, 'google');
    } catch (error) {
      logger.error('Google sign-in for cloud sync failed', error);
      useToastStore.getState().error('Something went wrong enabling sync — please try again.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      const result = await controller.reconnect();
      await routeEnableResult(result, 'reconnect');
    } catch (error) {
      logger.error('Cloud sync reconnect failed', error);
      useToastStore.getState().error("Couldn't reconnect sync — please try again.");
    } finally {
      setIsReconnecting(false);
    }
  };

  // Reconnect-after-needs-code reuses the persisted creds; a brand-new enable uses the form inputs.
  // Never rejects — messageFor can render a specific message instead of an unhandled rejection.
  const handleEnrollSubmit = async (code: string): Promise<EnableResult> => {
    let result: EnableResult;
    try {
      if (enrollSource === 'reconnect') {
        result = await controller.reconnect(code);
      } else if (enrollSource === 'google') {
        if (controller.enrollWithCode) {
          // ENG-65: finish the enroll against the still-live session — no second browser bounce.
          result = await controller.enrollWithCode(deviceName, code);
          // enrollWithCode's presence is load-bearing: it also means "we attempted a resume", so
          // only this branch runs the re-auth fallback. Making enrollWithCode required (e.g.
          // aliasing enableWithGoogle on the extension) would fire this on every host and sign in
          // twice. The resume can find the session already gone (revoked/expired while the user
          // hunted for the code) → reason:'auth'; retrying resume is hopeless, so fall back to a
          // full re-auth, which re-establishes the session (the code is already typed).
          if (!result.ok && result.reason === 'auth' && !isCancelledEnable(result)) {
            result = await controller.enableWithGoogle(deviceName, code);
          }
        } else {
          result = await controller.enableWithGoogle(deviceName, code);
        }
      } else {
        result = await controller.enable(accountId, deviceName, code);
      }
    } catch (error) {
      logger.error('Enroll submit failed', error);
      return { ok: false, reason: 'error' };
    }
    if (result.ok) {
      // Enrolled successfully — hand off from Chrome sync (see takeOverFromChromeSync).
      // A code is only required when the target account has an envelope, so this is the branch the
      // different-account case actually completes on — it needs adoptNewAccount as much as the other.
      await takeOverFromChromeSync();
      await adoptNewAccount();
      setEnabling(false);
      if (result.recoveryCode) {
        surfaceRecoveryCode(result.recoveryCode);
      }
    } else if (result.reason === 'cancelled') {
      routeAbandonedEnable(result.recoveryCode);
    } else if (isCancelledEnable(result)) {
      logger.info('Cloud sync enroll sign-in was cancelled by the user');
    } else if (pairedEnrollRef.current && result.recoveryCode === undefined) {
      // Pairing won the race the revealed code input deliberately allows, so this answer is moot —
      // but never when it carries a minted code, which only the branches above can surface.
      logger.info('Cloud sync enroll answered after pairing had already enrolled this device');
      return PAIRING_ALREADY_ENROLLED;
    } else {
      // The modal renders the message; this is the default-visible trace of what failed.
      logger.error(
        `Cloud sync enroll failed — reason=${result.reason}, detail=${result.detail ?? 'none'}`
      );
    }
    return result;
  };

  // Two clicks would upload two envelopes under two master keys and show whichever RESOLVED last,
  // which need not be the one the server kept — a saved code that opens nothing.
  const handleRegenerate = async () => {
    setIsRegenerating(true);
    let regenerated = false;
    try {
      const code = await controller.regenerateRecoveryCode();
      // The envelope is already replaced here, so a throw below is a display failure only.
      regenerated = true;
      setUnsavedCode(false);
      // Not setRecoveryCode: the server envelope is already replaced, so a closed panel must not
      // swallow the only copy of the code that opens it.
      surfaceRecoveryCode(code);
    } catch (error) {
      logger.error('Cloud sync regenerate recovery code failed', error);
      useToastStore.getState().error("Couldn't regenerate your recovery code — please try again.");
    } finally {
      setIsRegenerating(false);
    }
    // Outside the try, like handleSyncNow. Without it the banner this click fixed stays up all
    // mount; without an option, because the engine recorded the answer as it wrote the envelope.
    if (regenerated) {
      await refreshDetails(undefined);
    }
  };

  // `outcome.error` is deliberately not read: chrome.runtime JSON-serialises the outcome, so the
  // page realm gets `error: {}`. Only `reason` survives; the engine logged the real object already.
  const handleSyncNow = async () => {
    // Whether this click may speak is the account, not the read counter: macOS emits 'syncing' from
    // inside syncNow, and that emission must not retire the click it belongs to.
    lastCycleGenRef.current += 1;
    const accountGen = accountGenRef.current;
    setIsSyncing(true);
    try {
      const outcome = await controller.syncNow();
      // Above the guard: a build/skew defect is not this account's outcome, so a superseded click
      // must not drop the only evidence of it.
      logUnrecognisedReason(outcome);
      if (outcome.kind === 'cancelled') {
        // A disable landed mid-cycle: no cycle to paint, no account to toast about, and no
        // details left to refresh below.
        return;
      }
      // Only an account change retires this click: the cycle then belongs to an account the panel
      // no longer shows, so neither badge nor toast may speak for it.
      if (accountGenRef.current === accountGen) {
        // A read the cycle's own 'syncing' emission started is younger than the bump above, and
        // would otherwise outrank this paint.
        lastCycleGenRef.current += 1;
        // `no-key` means no cycle ran, so it must not speak for the last one that did — the engine
        // refuses to persist it for the same reason. Everything else is an answer.
        if (outcome.kind !== 'no-key') {
          setCycle({ kind: 'outcome', outcome });
        }
        if (outcome.kind === 'synced') {
          useToastStore.getState().success('Synced');
        } else if (outcome.kind === 'failed') {
          useToastStore.getState().error(failureMessage(outcome.reason));
        } else {
          useToastStore.getState().warning(INCOMPLETE_MESSAGE);
        }
      }
    } catch (error) {
      // The bridge builds `Sync now failed: <reason> — <detail>` into the message so the worker's
      // cause reaches here; message is non-enumerable, so it must be re-stated as text.
      logger.error(`Cloud sync sync-now failed: ${describeThrown(error)}`, error);
      // Same guard as the try: a superseded account's click may neither toast nor repaint.
      if (accountGenRef.current === accountGen) {
        useToastStore.getState().error("Couldn't sync right now — please try again.");
        await refreshLastCycle();
      }
    } finally {
      // In a finally like every sibling flag here: an unexpected throw must not strand the button.
      setIsSyncing(false);
    }
    // Refresh "Last synced" OUTSIDE the try — the sync-now error surface belongs to syncNow
    // alone (the catch keeps even a contract-violating host from rejecting the click handler).
    // Keep the last known details on a transient null: a stale line beats a vanishing one.
    detailsGenRef.current += 1;
    const gen = detailsGenRef.current;
    const next = await controller.getDetails(WITH_ENVELOPE).catch((error) => {
      logger.warn(
        `Cloud sync details refresh failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    });
    if (detailsGenRef.current === gen && next !== null) {
      setDetails(next);
    }
  };

  // Retry the exact action that failed. A dev-enable retry needs the form's account id; without it
  // (e.g. the UI mounted straight into a persisted error after a reload) fall back to reconnect,
  // which recovers from persisted creds. Google carries no account id, so it retries directly.
  const handleRetry = async () => {
    if (failedAction === 'google') {
      await handleGoogleSignIn();
      return;
    }
    if (failedAction === 'reconnect' || accountId.trim().length === 0) {
      await handleReconnect();
      return;
    }
    await handleEnable();
  };

  // The keyless device's code path is the reconnect one without the code-less attempt that can
  // only fail: reconnect(code) is where that flow already ended. Code-first, because this screen
  // is the pairing offer — the modal must not repeat it.
  const handleUseRecoveryCode = () => {
    setEnrollSource('reconnect');
    setEnrollCodeFirst(true);
    latchPairedEnroll(false);
    setEnrollOpen(true);
  };

  // An approval enrolled this device, so it ends where a typed code would have — minus the
  // recovery code, which pairing never mints. The latch goes up first and synchronously: it is
  // what keeps any surface from starting a fresh request while the status catches up.
  const finishPairedEnroll = async () => {
    latchPairedEnroll(true);
    setEnrollOpen(false);
    await takeOverFromChromeSync();
    await adoptNewAccount();
    setEnabling(false);
  };

  const handlePairingComplete = () => {
    void finishPairedEnroll();
  };

  const handleToggle = (checked: boolean) => {
    if (status === 'off') {
      setEnabling(checked);
      return;
    }
    if (!checked) {
      setConfirmDisableOpen(true);
    }
  };

  // finally closes the confirm dialog so a disable failure can't strand it open.
  const handleDisable = async () => {
    setIsDisabling(true);
    try {
      await controller.disable();
      setEnabling(false);
      // A re-enable in this same mount may be a DIFFERENT account — drop the shown identity,
      // re-arm the once-per-mount fetch, and invalidate any in-flight fetch for the old account
      // so its late resolution can't paint the previous owner's details.
      setDetails(null);
      setDetailsPending(false);
      detailsRequestedRef.current = false;
      detailsGenRef.current += 1;
      // Same reasoning for the cycle: a re-enable must never wear the previous account's failure,
      // nor its "couldn't check" — this is what retires a click the disable superseded.
      setCycle(CYCLE_NONE);
      lastCycleGenRef.current += 1;
      accountGenRef.current += 1;
    } catch (error) {
      logger.error('Cloud sync disable failed', error);
      useToastStore.getState().error("Couldn't disable sync — please try again.");
    } finally {
      setConfirmDisableOpen(false);
      setIsDisabling(false);
    }
  };

  const handleRecoverySaved = () => {
    setRecoveryCode(null);
    setUnsavedCode(false);
  };

  const handleRecoveryCancelUnsaved = () => {
    setRecoveryCode(null);
    setUnsavedCode(true);
  };

  const switchChecked = status === 'off' ? enabling : true;
  // `?? QUIET` so a status this build does not know renders nothing, not an empty pill or prompt.
  const presentation = STATUS_PRESENTATION[status] ?? QUIET;
  const pillLabel = presentation.kind === 'pill' ? presentation.label : null;
  // Beside the pill, never instead of it: status stays 'active' so the recovery controls survive.
  const known = knownOutcome(cycle);
  const badgeMessage = known?.kind === 'failed' ? failureMessage(known.reason) : null;
  // The badge outranks it: a carried-forward failure is the stronger claim. Only 'active' makes a
  // freshness claim worth qualifying — connecting and syncing have not made one yet.
  const showUnknownCycle = status === 'active' && cycle.kind === 'unknown' && badgeMessage === null;
  // Both prompts explain a device that has stopped syncing; only the fix offered below differs.
  const stoppedPrompt =
    presentation.kind === 'reconnect' || presentation.kind === 'pairing'
      ? presentation.prompt
      : null;
  // Only an explicit 'missing': 'unknown' means nothing has answered yet, and an older worker
  // answers details with the field absent entirely. Neither may claim an account has no code.
  // Gated on 'active' because that is the only status where Regenerate, the one fix, renders.
  const noRecoveryCode = status === 'active' && details?.recoveryEnvelope === 'missing';

  // The enable step's sign-in-options div groups Google today; a "Sign in with Apple"
  // button drops in next to it later.
  return (
    <div>
      <SettingRow
        label="Cloud Sync — end-to-end encrypted"
        help="Encrypted on this device before it leaves — we can't read your data."
        filter={filter}
        keywords={SEARCH_TERMS}
      >
        <Switch
          id="cloud-sync-switch"
          label="Cloud Sync"
          checked={switchChecked}
          onChange={handleToggle}
        />
      </SettingRow>

      {unsavedCode && (
        <div
          data-testid="unsaved-code-banner"
          className="my-1.5 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-none" />
          recovery code not saved — Regenerate to get a new one
        </div>
      )}

      {noRecoveryCode && !unsavedCode && (
        <div
          data-testid="no-recovery-code-banner"
          className="my-1.5 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-none" />
          no recovery code for this account — Regenerate to create one
        </div>
      )}

      {status === 'off' && enabling && (
        <SettingSubgroup>
          <div className="flex flex-col gap-3 py-2">
            <div className="space-y-1.5">
              <label htmlFor="sync-device-name" className="block text-sm font-medium text-primary">
                Device name
              </label>
              <input
                id="sync-device-name"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {controller.canEnableWithGoogle() && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleSigningIn}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGoogleSigningIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleGlyph />
                  )}
                  {isGoogleSigningIn ? 'Signing in…' : 'Sign in with Google'}
                </button>
                {isGoogleSigningIn && controller.cancelEnableWithGoogle && (
                  <button
                    type="button"
                    onClick={() => controller.cancelEnableWithGoogle?.()}
                    className="w-full rounded-lg px-4 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-primary"
                  >
                    Cancel sign-in
                  </button>
                )}
              </div>
            )}

            {import.meta.env.DEV && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-tertiary">
                  Dev only — sign in by account ID
                </p>
                <div className="space-y-1.5">
                  <label
                    htmlFor="sync-account-id"
                    className="block text-sm font-medium text-primary"
                  >
                    Account ID
                  </label>
                  <input
                    id="sync-account-id"
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={isSubmitting || accountId.trim().length === 0}
                  className="flex w-fit items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Enabling…' : 'Enable'}
                </button>
              </div>
            )}
          </div>
        </SettingSubgroup>
      )}

      {pillLabel && (
        <SettingSubgroup>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="sync-status-pill" className={pillClass(status)}>
                {pillLabel}
              </span>
              {badgeMessage !== null && (
                <span
                  data-testid="sync-failure-badge"
                  className="inline-flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
                >
                  <AlertTriangle className="h-3.5 w-3.5 flex-none" />
                  {badgeMessage}
                </span>
              )}
              {showUnknownCycle && (
                <span data-testid="sync-cycle-unknown" className="text-xs text-tertiary">
                  Couldn't check when this device last synced.
                </span>
              )}
            </div>
            {details !== null && (
              <div data-testid="sync-account-label" className="text-xs text-tertiary">
                {details.accountEmail !== null
                  ? `Signed in as ${details.accountEmail}`
                  : `Account: ${details.accountId.slice(0, 8)}…`}
              </div>
            )}
            {detailsPending && (
              <div
                data-testid="sync-account-skeleton"
                aria-hidden="true"
                className={ACCOUNT_SKELETON_ROW}
              >
                <span className="h-3 w-48 animate-pulse rounded bg-surface-variant" />
              </div>
            )}
            <div data-testid="sync-device-label" className="text-xs text-tertiary">
              Device: {deviceName}
              {details !== null && details.lastSyncedAt !== null
                ? ` · Last synced ${formatMillisAgo(details.lastSyncedAt)}`
                : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
                Sync now
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Regenerate recovery code
              </button>
            </div>
            <SessionList
              onRegenerateRecoveryCode={handleRegenerate}
              isRegeneratingRecoveryCode={isRegenerating}
            />
          </div>
        </SettingSubgroup>
      )}

      {stoppedPrompt !== null && (
        <SettingSubgroup>
          <div className="flex flex-col gap-2 py-2">
            <p data-testid="sync-reconnect-prompt" className="text-xs text-tertiary">
              {stoppedPrompt}
            </p>
            {presentation.kind === 'pairing' && !pairedEnroll && (
              <PairingPanel
                onUseRecoveryCode={handleUseRecoveryCode}
                onComplete={handlePairingComplete}
              />
            )}
            {presentation.kind === 'reconnect' && (
              <button
                type="button"
                onClick={handleReconnect}
                disabled={isReconnecting}
                className="flex w-fit items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isReconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isReconnecting ? 'Reconnecting…' : 'Reconnect'}
              </button>
            )}
          </div>
        </SettingSubgroup>
      )}

      {status === 'error' && (
        <SettingSubgroup>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-xs text-error">Couldn't turn on Cloud Sync — please try again.</p>
            <button
              type="button"
              onClick={handleRetry}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </SettingSubgroup>
      )}

      <ConfirmationDialog
        isOpen={confirmDisableOpen}
        onClose={() => setConfirmDisableOpen(false)}
        onConfirm={handleDisable}
        title="Disable Cloud Sync?"
        message={unsavedCode ? DISABLE_MESSAGE_UNSAVED : DISABLE_MESSAGE}
        confirmText="Disable"
        variant="warning"
        isLoading={isDisabling}
      />

      <RecoveryCodeModal
        isOpen={recoveryCode !== null}
        code={recoveryCode ?? ''}
        onSaved={handleRecoverySaved}
        onCancelUnsaved={handleRecoveryCancelUnsaved}
      />

      <EnrollCodeModal
        isOpen={enrollOpen}
        onSubmit={handleEnrollSubmit}
        onClose={() => setEnrollOpen(false)}
        onPaired={handlePairingComplete}
        startWithCode={enrollCodeFirst}
      />
    </div>
  );
};

export const syncSettingsSection: SettingsSection = {
  id: 'cloud-sync',
  label: 'Cloud Sync',
  icon: CloudUpload,
  component: SyncSettingsSectionComponent,
  terms: SEARCH_TERMS,
};
