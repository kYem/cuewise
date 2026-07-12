export class DecryptError extends Error {
  constructor(message = 'decryption failed', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DecryptError';
  }
}

export class EnvelopeParseError extends Error {
  constructor(message = 'malformed envelope', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EnvelopeParseError';
  }
}

export type RecoveryCodeErrorKind = 'format' | 'checksum' | 'version';

export class RecoveryCodeError extends Error {
  constructor(
    public readonly kind: RecoveryCodeErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'RecoveryCodeError';
  }
}
