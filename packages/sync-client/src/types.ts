export interface PushRecord {
  collection: string;
  entityId: string;
  ciphertext: string;
  clientUpdatedAt: number;
  deleted: boolean;
}

export interface SyncRecord extends PushRecord {
  seq: number;
}

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  retryAfter?: number;
  errors?: Array<{ index?: number; pointer?: string; detail: string }>;
}
