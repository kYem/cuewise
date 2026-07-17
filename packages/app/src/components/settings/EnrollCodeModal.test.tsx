import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnableResult } from '../../sync/sync-controller';
import { EnrollCodeModal } from './EnrollCodeModal';

const toastError = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError }),
  },
}));

beforeEach(() => {
  toastError.mockClear();
});

const CODE = 'CW1-MWWJH-3K3QQ-R4RNB-JW1PV-8TRQT-PC14A-R5G5V';

const handlers = (onSubmit: (code: string) => Promise<EnableResult>) => ({
  onSubmit: vi.fn(onSubmit),
  onClose: vi.fn(),
});

// Deferred promise so tests can assert the pending/spinner state before resolving.
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const typeCode = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  const input = screen.getByLabelText(/recovery code/i);
  await user.type(input, value);
};

describe('EnrollCodeModal', () => {
  it('renders nothing when closed', () => {
    const h = handlers(async () => ({ ok: true }));
    render(<EnrollCodeModal isOpen={false} {...h} />);

    expect(screen.queryByLabelText(/recovery code/i)).not.toBeInTheDocument();
  });

  it('submits the typed code and shows a spinner while pending', async () => {
    const user = userEvent.setup();
    const { promise, resolve } = deferred<EnableResult>();
    const h = handlers(() => promise);
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(h.onSubmit).toHaveBeenCalledWith(CODE);
    expect(screen.getByRole('button', { name: /enrolling/i })).toBeDisabled();
    expect(screen.getByTestId('enroll-spinner')).toBeInTheDocument();

    resolve({ ok: true });
    await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
  });

  it('does not sanitise the typed value before submitting', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: true }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, ' messy input ');
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(h.onSubmit).toHaveBeenCalledWith(' messy input ');
  });

  it('closes the modal on a successful enroll', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: true }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
  });

  it('shows a format-specific message for a bad-code/format failure', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'bad-code', detail: 'format' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, 'not-a-code');
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(await screen.findByText("That doesn't look like a recovery code")).toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('shows a checksum-specific message for a bad-code/checksum failure', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'bad-code', detail: 'checksum' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(
      await screen.findByText("Code didn't check out — re-check for typos")
    ).toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('shows a version-specific message for a bad-code/version failure', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'bad-code', detail: 'version' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(await screen.findByText('Unsupported code version')).toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('shows a generic message for a bad-code failure with an unrecognised detail', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'bad-code', detail: 'mystery' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toBe('');
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('shows a generic message for a bad-code failure with no detail', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'bad-code' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toBe('');
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('shows a generic failure message for an auth failure', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'auth' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('shows a generic failure message for an error failure', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'error', detail: 'network down' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('stays open with no error line or toast when the re-auth is cancelled', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'auth', detail: 'cancelled' }));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(await screen.findByRole('button', { name: 'Enroll' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('surfaces a late failure as a toast when the modal was dismissed mid-submit', async () => {
    // A google-source submit runs a minutes-long OAuth dance; the user may Escape the modal
    // meanwhile. The failure must not vanish with the error line's render target.
    const user = userEvent.setup();
    const { promise, resolve } = deferred<EnableResult>();
    const h = handlers(() => promise);
    const { rerender } = render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    rerender(<EnrollCodeModal isOpen={false} {...h} />);
    resolve({ ok: false, reason: 'auth' });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('surfaces a late failure as a toast when the whole modal UNMOUNTED mid-submit', async () => {
    // Escape can unmount the settings tree without ever rendering isOpen=false — the unmount
    // cleanup must flip the ref so the failure still reaches the global toast.
    const user = userEvent.setup();
    const { promise, resolve } = deferred<EnableResult>();
    const h = handlers(() => promise);
    const { unmount } = render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    unmount();
    resolve({ ok: false, reason: 'auth' });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('disables Enroll while the code is empty, so a blank submit never runs the flow', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: true }));
    render(<EnrollCodeModal isOpen {...h} />);

    expect(screen.getByRole('button', { name: 'Enroll' })).toBeDisabled();
    await typeCode(user, CODE);
    expect(screen.getByRole('button', { name: 'Enroll' })).toBeEnabled();
  });

  it('clears a stale error message on a new submit attempt', async () => {
    const user = userEvent.setup();
    let call = 0;
    const h = handlers(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, reason: 'bad-code', detail: 'format' };
      }
      return { ok: true };
    });
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(await screen.findByText("That doesn't look like a recovery code")).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(screen.queryByText("That doesn't look like a recovery code")).not.toBeInTheDocument()
    );
  });

  it('calls onClose when the modal is dismissed via the backdrop', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: true }));
    render(<EnrollCodeModal isOpen {...h} />);

    await user.click(screen.getByLabelText('Close modal'));

    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the generic failure message and re-enables the Enroll button when onSubmit rejects', async () => {
    const user = userEvent.setup();
    const h = handlers(() => Promise.reject(new Error('boom')));
    render(<EnrollCodeModal isOpen {...h} />);

    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    expect(
      await screen.findByText("Couldn't enroll this device — please try again")
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enroll' })).toBeEnabled());
    expect(screen.queryByTestId('enroll-spinner')).not.toBeInTheDocument();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it('resets the code and error state each time the modal reopens', async () => {
    const user = userEvent.setup();
    const h = handlers(async () => ({ ok: false, reason: 'bad-code', detail: 'format' }));
    const { rerender } = render(<EnrollCodeModal isOpen={false} {...h} />);

    rerender(<EnrollCodeModal isOpen {...h} />);
    await typeCode(user, CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(await screen.findByText("That doesn't look like a recovery code")).toBeInTheDocument();

    rerender(<EnrollCodeModal isOpen={false} {...h} />);
    rerender(<EnrollCodeModal isOpen {...h} />);

    expect(screen.queryByText("That doesn't look like a recovery code")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/recovery code/i)).toHaveValue('');
  });
});
