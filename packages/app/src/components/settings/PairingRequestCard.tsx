import { describeThrown, logger } from '@cuewise/shared';
import type { PairingApprovalResult, PendingPairing } from '@cuewise/sync-engine';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import { useSyncController } from '../../sync/sync-controller';
import { formatSas, POLL_INTERVAL_MS } from './PairingPanel';

const SHOW_CODE = 'Show code';
const WAITING_FOR_DEVICE = 'Waiting for your other device…';
const CONFIRM_PROMPT = 'Do the codes match?';
const APPROVE = 'Approve';
const DENY = 'Deny';
const TAMPERED_MESSAGE = "Pairing blocked: the request didn't verify. Try again on the new device.";
const APPROVE_FAILED = "Couldn't approve this device — try again.";
const DENY_FAILED = "Couldn't decline — try again.";

/** What one card shows for the one request it was handed. */
type CardState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'committing' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'confirm'; readonly sas: string }
  | { readonly kind: 'resolving' };

const IDLE: CardState = { kind: 'idle' };
const COMMITTING: CardState = { kind: 'committing' };
const WAITING: CardState = { kind: 'waiting' };
const RESOLVING: CardState = { kind: 'resolving' };

interface PairingRequestCardProps {
  /** Must come from a GATED listPairingRequests() poll — commitPairing has no active/dk guard. */
  request: PendingPairing;
  /** The request left the list — approved, denied, or commitPairing answered null. */
  onResolved: (id: string) => void;
}

/**
 * The approver's half of ENG-50 pairing (packages/app/src/components/settings/SyncSettingsSection.tsx
 * polls listPairingRequests and renders one of these per pending request): Show code -> confirm
 * digits -> Approve/Deny.
 */
export const PairingRequestCard: React.FC<PairingRequestCardProps> = ({ request, onResolved }) => {
  const controller = useSyncController();
  const [state, setState] = useState<CardState>(IDLE);
  // Read through a ref, so a parent re-render's new closure cannot restart the poll interval.
  const onResolvedRef = useRef(onResolved);
  // The latest row the section's list poll fetched. pollApproval reads it so the engine reuses this
  // reveal instead of re-listing the account — one poll stream against the shared bucket, not two.
  const requestRef = useRef(request);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  // Only live between a successful commit and a terminal poll answer — cleared whenever the card
  // leaves `waiting` (confirm, removal, or unmount), same overlap guard as PairingPanel's poll.
  useEffect(() => {
    if (controller === null || state.kind !== 'waiting') {
      return undefined;
    }
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling) {
        return;
      }
      polling = true;
      let result: PairingApprovalResult;
      try {
        result = await controller.pollApproval(request.id, requestRef.current);
      } catch (error) {
        // Contracted never to reject; a host that breaks that is treated like a transport fault.
        logger.error(`Cloud sync pairing approval poll failed: ${describeThrown(error)}`, error);
        result = { kind: 'error' };
      } finally {
        polling = false;
      }
      if (cancelled) {
        return;
      }
      if (result.kind === 'confirm') {
        setState({ kind: 'confirm', sas: result.sas });
        return;
      }
      if (result.kind === 'failed') {
        if (result.reason === 'tampered') {
          useToastStore.getState().error(TAMPERED_MESSAGE);
        }
        onResolvedRef.current(request.id);
      }
      // waiting/error: stay put — the next tick retries.
    };
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [controller, state.kind, request.id]);

  if (controller === null) {
    return null;
  }

  const handleShowCode = async () => {
    setState(COMMITTING);
    let result: { pending: true } | null;
    try {
      result = await controller.commitPairing(request.id);
    } catch (error) {
      // Contracted never to reject; a host that breaks that ends the request like any other fault.
      logger.error(`Cloud sync pairing commit failed: ${describeThrown(error)}`, error);
      result = null;
    }
    if (result === null) {
      onResolved(request.id);
      return;
    }
    setState(WAITING);
  };

  const handleApprove = async () => {
    // Restored below on failure: the engine slot is still valid, so the card must offer the retry
    // rather than disappear as if the other device had been let in.
    const previous = state;
    setState(RESOLVING);
    let approved = false;
    try {
      approved = await controller.approvePairing(request.id);
    } catch (error) {
      logger.error(`Cloud sync pairing approve failed: ${describeThrown(error)}`, error);
    }
    if (!approved) {
      useToastStore.getState().error(APPROVE_FAILED);
      setState(previous);
      return;
    }
    onResolved(request.id);
  };

  const handleDeny = async () => {
    const previous = state;
    setState(RESOLVING);
    try {
      await controller.denyPairing(request.id);
    } catch (error) {
      logger.error(`Cloud sync pairing deny failed: ${describeThrown(error)}`, error);
      useToastStore.getState().error(DENY_FAILED);
      setState(previous);
      return;
    }
    onResolved(request.id);
  };

  const waiting = state.kind === 'waiting';
  const codeShown = state.kind === 'confirm';
  const busy = state.kind === 'committing' || state.kind === 'resolving';

  return (
    <div
      data-testid="pairing-request-card"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <p className="text-sm text-primary">
        <strong className="font-medium">{request.deviceName}</strong> wants to join your sync
      </p>
      {waiting && (
        <p data-testid="pairing-request-waiting" className="text-xs text-tertiary">
          {WAITING_FOR_DEVICE}
        </p>
      )}
      {codeShown && (
        <div className="flex flex-col gap-1">
          <p
            data-testid="pairing-request-sas"
            className="font-mono text-2xl font-semibold tracking-widest text-primary"
          >
            {formatSas(state.sas)}
          </p>
          <p className="text-xs text-tertiary">{CONFIRM_PROMPT}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleShowCode()}
          disabled={busy || waiting || codeShown}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
        >
          {SHOW_CODE}
        </button>
        <button
          type="button"
          onClick={() => void handleApprove()}
          disabled={!codeShown || busy}
          className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {APPROVE}
        </button>
        <button
          type="button"
          onClick={() => void handleDeny()}
          disabled={busy}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
        >
          {DENY}
        </button>
      </div>
    </div>
  );
};
