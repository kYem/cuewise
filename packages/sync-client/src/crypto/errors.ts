export class DecryptError extends Error {
  constructor(message = 'decryption failed') {
    super(message);
    this.name = 'DecryptError';
  }
}

export class EnvelopeParseError extends Error {
  constructor(message = 'malformed envelope') {
    super(message);
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
