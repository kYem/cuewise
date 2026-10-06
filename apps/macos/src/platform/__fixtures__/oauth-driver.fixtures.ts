import { OAuthCancelledError, type OAuthDriver } from '../oauth-driver';

/** Default driver: tests that never run an OAuth flow fail loudly if one runs anyway. */
export function unusedDriver(): OAuthDriver {
  return {
    async authorize(): Promise<string> {
      throw new Error('no OAuth flow expected in this test');
    },
    cancel(): void {},
  };
}

export interface FakeOAuthDriver {
  driver: OAuthDriver;
  /** Every startUrl authorize() was asked to open, in order. */
  calls: string[];
}

/** Scriptable driver: resolves every authorize() with `outcome`, or rejects if it's an Error. */
export function fakeOAuthDriver(outcome: string | Error): FakeOAuthDriver {
  const calls: string[] = [];
  return {
    calls,
    driver: {
      async authorize(startUrl: string): Promise<string> {
        calls.push(startUrl);
        if (outcome instanceof Error) {
          throw outcome;
        }
        return outcome;
      },
      cancel(): void {},
    },
  };
}

/** Hangs authorize() until cancel() rejects it; `waitForPending()` resolves once it is pending. */
export function hangingOAuthDriver(): OAuthDriver & { waitForPending: () => Promise<void> } {
  let rejectPending: ((err: Error) => void) | null = null;
  let notifyPending: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    notifyPending = resolve;
  });
  return {
    waitForPending: () => pending,
    authorize(): Promise<string> {
      return new Promise<string>((_resolve, reject) => {
        rejectPending = reject;
        notifyPending();
      });
    },
    cancel(): void {
      if (rejectPending !== null) {
        rejectPending(new OAuthCancelledError());
        rejectPending = null;
      }
    },
  };
}
