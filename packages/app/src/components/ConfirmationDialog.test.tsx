import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

const baseProps = {
  isOpen: true,
  onConfirm: vi.fn(),
  title: 'Delete goal?',
  message: 'This cannot be undone.',
};

const flushFocusTimer = () => act(() => vi.runAllTimers());

describe('ConfirmationDialog focus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('focuses Cancel on open', () => {
    render(<ConfirmationDialog {...baseProps} onClose={vi.fn()} />);
    flushFocusTimer();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('refocuses Cancel once loading ends', () => {
    const onClose = vi.fn();
    const { rerender } = render(<ConfirmationDialog {...baseProps} onClose={onClose} />);
    flushFocusTimer();

    screen.getByRole('button', { name: 'Cancel' }).blur();
    rerender(<ConfirmationDialog {...baseProps} onClose={onClose} isLoading />);
    rerender(<ConfirmationDialog {...baseProps} onClose={onClose} isLoading={false} />);
    flushFocusTimer();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('does not steal focus when onClose changes identity', () => {
    const { rerender } = render(<ConfirmationDialog {...baseProps} onClose={vi.fn()} />);
    flushFocusTimer();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    confirm.focus();

    rerender(<ConfirmationDialog {...baseProps} onClose={vi.fn()} />);
    flushFocusTimer();

    expect(confirm).toHaveFocus();
  });
});
