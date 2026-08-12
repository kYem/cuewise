import type {
  PairingCommitment,
  PairingNonceB64,
  PairingPublicKeyB64,
  PeerWrappedEnvelope,
} from '@cuewise/crypto';
import type {
  ExchangeTokenRequest,
  KeyEnvelopeExport,
  KeyEnvelopeRecord,
  PushRecord,
  SyncRecord,
  SyncSession,
} from '@cuewise/shared';

export type {
  ExchangeTokenRequest,
  KeyEnvelopeExport,
  KeyEnvelopeRecord,
  PushRecord,
  SyncRecord,
  SyncSession,
};

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  retryAfter?: number;
  errors?: Array<{ index?: number; pointer?: string; detail: string }>;
}

export interface PairingCreated {
  id: string;
  expiresAt: number;
}

export interface PairingForRequester {
  id: string;
  approverPublicKey: PairingPublicKeyB64 | null;
  envelope: PeerWrappedEnvelope | null;
  expiresAt: number;
}

export interface PendingPairing {
  id: string;
  deviceName: string;
  requesterCommitment: PairingCommitment;
  // Both null until the requester reveals, which the server refuses before an approver has committed.
  requesterPublicKey: PairingPublicKeyB64 | null;
  requesterNonce: PairingNonceB64 | null;
  createdAt: number;
}
