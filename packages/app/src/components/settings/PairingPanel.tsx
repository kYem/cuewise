import { describeThrown, logger } from '@cuewise/shared';
import type { PairingPollResult } from '@cuewise/sync-engine';
import { RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSyncController } from '../../sync/sync-controller';

const HEADING = 'Approve from another device';
const BODY = 'On your other device, open Settings → Cloud Sync and approve this device.';
const WAITING = 'Waiting for approval…';
const NOT_APPROVED = 'Not approved — try again, or use your recovery code.';
// Shaped like the approver's TAMPERED_MESSAGE. This screen is on the device with no key yet,
// so naming the other device's key is unambiguous here.
const BLOCKED =
  "Pairing blocked: the other device's key didn't verify. Try again, or use your recovery code.";
const USE_RECOVERY_CODE = 'Enter your recovery code instead';
const RETRY = 'Try again';

export const POLL_INTERVAL_MS = 3000;

/**
 * What the requester's screen shows for the one request it is running. Every `failed` poll reason
 * is terminal with the same two offers, so only the message differs — and `tampered` has to say
 * the key was refused rather than report a caught substitution as an ordinary decline.
 */
type PairingState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'confirm'; readonly sas: string }
  | { readonly kind: 'failed'; readonly message: string };

const STARTING: PairingState = { kind: 'starting' };
const WAITING_STATE: PairingState = { kind: 'waiting' };
const FAILED: PairingState = { kind: 'failed', message: NOT_APPROVED };
const BLOCKED_STATE: PairingState = { kind: 'failed', message: BLOCKED };

/** `391554` → `391 554`: two groups is what someone can read aloud without losing their place. */
export function formatSas(sas: string): string {
  return `${sas.slice(0, 3)} ${sas.slice(3)}`;
}

interface PairingPanelProps {
  /** Offers the recovery code as the fallback; omitted where that flow is already on screen. */
  onUseRecoveryCode?: () => void;
  /** An approval landed and this device adopted the key — the caller finishes the enrol. */
  onComplete: () => void;
}

/**
 * The keyless device's half of ENG-50 pairing: it publishes a request on mount and polls it while
 * this panel is on screen, so a device that still holds the key can hand it over after both
 * screens show the same digits.
 */
export const PairingPanel: React.FC<PairingPanelProps> = ({ onUseRecoveryCode, onComplete }) => {
  const controller = useSyncController();
  const [state, setState] = useState<PairingState>(STARTING);
  // Bumped by Try again; re-runs the effect, whose cleanup ends the request it replaces.
  const [attempt, setAttempt] = useState(0);
  // Read through a ref, so a caller re-rendering a new closure cannot restart the request.
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (controller === null) {
      return undefined;
    }
    let cancelled = false;
    let polling = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stopPolling = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const poll = async () => {
      // A slow poll must not have the next tick stack on top of it: the engine answers the second
      // one an error, which would end a request the first is still driving.
      if (polling) {
        return;
      }
      polling = true;
      let result: PairingPollResult;
      try {
        result = await controller.pollPairing();
      } catch (error) {
        // Contracted never to reject; a host that breaks that ends the request like any other fault.
        logger.error(`Cloud sync pairing poll failed: ${describeThrown(error)}`, error);
        result = { kind: 'failed', reason: 'error' };
      } finally {
        polling = false;
      }
      if (cancelled) {
        return;
      }
      if (result.kind === 'complete') {
        // This device is enrolled now: the caller runs the same tail a typed code would have.
        stopPolling();
        completeRef.current();
        return;
      }
      if (result.kind === 'failed') {
        stopPolling();
        setState(result.reason === 'tampered' ? BLOCKED_STATE : FAILED);
        return;
      }
      if (result.kind === 'confirm') {
        setState({ kind: 'confirm', sas: result.sas });
        return;
      }
      if (result.kind === 'error') {
        // Non-terminal: the request stands, so keep whatever is on screen — even the digits, which
        // a wait state would erase mid-comparison — and let the next tick answer.
        return;
      }
      setState(WAITING_STATE);
    };

    const begin = async () => {
      setState(STARTING);
      let started: { pairingId: string } | null;
      try {
        started = await controller.beginPairing();
      } catch (error) {
        logger.error(`Cloud sync pairing request failed: ${describeThrown(error)}`, error);
        started = null;
      }
      if (cancelled) {
        return;
      }
      if (started === null) {
        // Nothing to poll: this device already has a key, an enroll is in flight, or it is signed
        // out. All three are the user's cue to retry or fall back to the code.
        setState(FAILED);
        return;
      }
      setState(WAITING_STATE);
      timer = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    void begin();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [controller, attempt]);

  const waiting = state.kind === 'starting' || state.kind === 'waiting';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-primary">{HEADING}</p>
      <p className="text-xs text-tertiary">{BODY}</p>
      {state.kind === 'confirm' && (
        <p
          data-testid="pairing-code"
          className="font-mono text-2xl font-semibold tracking-widest text-primary"
        >
          {formatSas(state.sas)}
        </p>
      )}
      {waiting && (
        <p data-testid="pairing-waiting" className="text-xs text-tertiary">
          {WAITING}
        </p>
      )}
      {state.kind === 'failed' && (
        <div className="flex flex-col gap-2">
          <p data-testid="pairing-failed" className="text-xs text-warning">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((previous) => previous + 1)}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {RETRY}
          </button>
        </div>
      )}
      {onUseRecoveryCode !== undefined && (
        <button
          type="button"
          onClick={onUseRecoveryCode}
          className="w-fit text-xs font-medium text-secondary underline underline-offset-2 transition-colors hover:text-primary"
        >
          {USE_RECOVERY_CODE}
        </button>
      )}
    </div>
  );
};
