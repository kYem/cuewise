import type {
  ExchangeTokenRequest,
  KeyEnvelopeRecord,
  PushRecord,
  SyncRecord,
} from '@cuewise/shared';

export type { ExchangeTokenRequest, KeyEnvelopeRecord, PushRecord, SyncRecord };

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  retryAfter?: number;
  errors?: Array<{ index?: number; pointer?: string; detail: string }>;
}
