import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EnableResult } from '../../sync/sync-controller';
import { EnrollCodeModal } from './EnrollCodeModal';

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
