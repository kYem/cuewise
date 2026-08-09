import { describeThrown, logger } from '@cuewise/shared';
import type { PendingPairing } from '@cuewise/sync-engine';
import type React from 'react';
import { useState } from 'react';
import { useSyncController } from '../../sync/sync-controller';
import { formatSas } from './PairingPanel';

const SHOW_CODE = 'Show code';
const CONFIRM_PROMPT = 'Do the codes match?';
const APPROVE = 'Approve';
const DENY = 'Deny';

/** What one card shows for the one request it was handed. */
type CardState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'committing' }
  | { readonly kind: 'confirm'; readonly sas: string }
  | { readonly kind: 'resolving' };

const IDLE: CardState = { kind: 'idle' };
const COMMITTING: CardState = { kind: 'committing' };
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

  if (controller === null) {
    return null;
  }

  const handleShowCode = async () => {
    setState(COMMITTING);
    let result: { sas: string } | null;
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
    setState({ kind: 'confirm', sas: result.sas });
  };

  const handleApprove = async () => {
    setState(RESOLVING);
    try {
      await controller.approvePairing(request.id);
    } catch (error) {
      logger.error(`Cloud sync pairing approve failed: ${describeThrown(error)}`, error);
    }
    onResolved(request.id);
  };

  const handleDeny = async () => {
    setState(RESOLVING);
    try {
      await controller.denyPairing(request.id);
    } catch (error) {
      logger.error(`Cloud sync pairing deny failed: ${describeThrown(error)}`, error);
    }
    onResolved(request.id);
  };

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
          disabled={busy || codeShown}
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
