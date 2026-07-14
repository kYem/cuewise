import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryCodeModal } from './RecoveryCodeModal';

// Mock toast store with module-level fns so each level is inspectable across getState() calls.
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: toastError,
      success: toastSuccess,
    }),
  },
}));

// Real CW1 format from @cuewise/crypto's recovery-code layout: VERSION-groupsOf5(secret+checksum).
const CODE = 'CW1-MWWJH-3K3QQ-R4RNB-JW1PV-8TRQT-PC14A-R5G5V';
const GROUP_3 = '3K3QQ';

const handlers = () => ({ onSaved: vi.fn(), onCancelUnsaved: vi.fn() });

const typeConfirmValue = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  const input = screen.getByLabelText(/group 3/i);
  await user.clear(input);
  await user.type(input, value);
};

describe('RecoveryCodeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const h = handlers();
    render(<RecoveryCodeModal isOpen={false} code={CODE} {...h} />);

    expect(screen.queryByText('MWWJH')).not.toBeInTheDocument();
  });

  it('renders the code grouped into its dash-separated segments', () => {
    const h = handlers();
    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);

    for (const group of CODE.split('-')) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it('copies the code to the clipboard and shows a success toast', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(CODE);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0]?.[0]).not.toContain(CODE);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows an error toast when the clipboard write rejects', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0]?.[0]).not.toContain(CODE);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('downloads a .txt file containing the code', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    // jsdom does not implement Blob URLs; stub the two static methods this component calls.
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);
    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0] as [Blob];
    expect(blob).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('shows an error toast and does not crash when the download fails', async () => {
    const user = userEvent.setup();
    const h = handlers();
    // jsdom does not implement Blob URLs, so createObjectURL is a plain assignment
    // (not a pre-existing method), mirroring the happy-path download test's stub.
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => {
      throw new Error('blocked');
    });

    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);
    await user.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith('Failed to download recovery code');

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('disables Done until the group-3 segment is typed correctly', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);

    const doneButton = screen.getByRole('button', { name: 'Done' });
    expect(doneButton).toBeDisabled();

    await typeConfirmValue(user, 'wrong');
    expect(doneButton).toBeDisabled();

    await typeConfirmValue(user, GROUP_3.toLowerCase());
    expect(doneButton).toBeEnabled();
  });

  it('normalises case and stray spaces before comparing the segment', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);

    await typeConfirmValue(user, ' 3k3 qq ');

    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('calls onSaved when Done is clicked with a matching segment', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);

    await typeConfirmValue(user, GROUP_3);
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(h.onSaved).toHaveBeenCalledTimes(1);
    expect(h.onCancelUnsaved).not.toHaveBeenCalled();
  });

  it('calls onCancelUnsaved when closed via the backdrop without a match', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);

    await user.click(screen.getByLabelText('Close modal'));

    expect(h.onCancelUnsaved).toHaveBeenCalledTimes(1);
    expect(h.onSaved).not.toHaveBeenCalled();
  });

  it('calls onCancelUnsaved when closed via the header close button, even with a matching segment typed', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<RecoveryCodeModal isOpen code={CODE} {...h} />);

    await typeConfirmValue(user, GROUP_3);
    await user.click(screen.getByLabelText('Close'));

    expect(h.onCancelUnsaved).toHaveBeenCalledTimes(1);
    expect(h.onSaved).not.toHaveBeenCalled();
  });
});
