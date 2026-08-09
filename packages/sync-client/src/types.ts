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
  approverPublicKey: string | null;
  envelope: string | null;
  expiresAt: number;
}

export interface PendingPairing {
  id: string;
  deviceName: string;
  requesterPublicKey: string;
  createdAt: number;
}
