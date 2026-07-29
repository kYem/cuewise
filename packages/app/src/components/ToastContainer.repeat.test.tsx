import { type Toast, ToastContainer } from '@cuewise/ui';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const base: Toast = {
  id: 't1',
  type: 'error',
  message: 'Failed to refresh quote.',
  duration: 5000,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// A collapsed repeat that keeps the first attempt's clock fades while the failure is still
// current, so the retry the user just made looks like it worked.
describe('a toast a repeat was collapsed into', () => {
  it('restarts its auto-dismiss rather than running out the first attempt clock', () => {
    const onClose = vi.fn();
    const { rerender } = render(<ToastContainer toasts={[base]} onClose={onClose} />);

    vi.advanceTimersByTime(4000);
    rerender(<ToastContainer toasts={[{ ...base, repeatedAt: 4000 }]} onClose={onClose} />);
    vi.advanceTimersByTime(4000);

    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(onClose).toHaveBeenCalledWith('t1');
  });
});
