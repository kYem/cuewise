import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogChrome } from './useDialogChrome';

interface HarnessProps {
  open: boolean;
  onClose: () => void;
  ignoreEscape?: (event: KeyboardEvent) => boolean;
}

function Harness({ children, ...options }: HarnessProps & { children?: ReactNode }) {
  useDialogChrome(options);
  return children ?? null;
}

function NestedHarness({ innerOpen }: { innerOpen: boolean }) {
  return (
    <Harness open onClose={vi.fn()}>
      <Harness open={innerOpen} onClose={vi.fn()} />
    </Harness>
  );
}

const pressEscape = () => fireEvent.keyDown(document, { key: 'Escape' });

describe('useDialogChrome', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('calls onClose on Escape while open', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing while closed', () => {
    const onClose = vi.fn();
    document.body.style.overflow = 'auto';
    render(<Harness open={false} onClose={onClose} />);

    pressEscape();

    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('keeps the dialog open when ignoreEscape returns true', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} ignoreEscape={() => true} />);

    pressEscape();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open', () => {
    render(<Harness open onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores the previous overflow on close', () => {
    document.body.style.overflow = 'scroll';
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);

    rerender(<Harness open={false} onClose={onClose} />);

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores the previous overflow on unmount', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = render(<Harness open onClose={vi.fn()} />);

    unmount();

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps an outer dialog scroll-locked when a nested one closes', () => {
    const outer = render(<Harness open onClose={vi.fn()} />);
    const inner = render(<Harness open onClose={vi.fn()} />);

    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    outer.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the original overflow when a parent and its open child unmount together', () => {
    document.body.style.overflow = 'scroll';
    const { rerender, unmount } = render(<NestedHarness innerOpen={false} />);
    rerender(<NestedHarness innerOpen />);

    unmount();

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps scroll locked until the last of two sibling dialogs closes', () => {
    document.body.style.overflow = 'scroll';
    const first = render(<Harness open onClose={vi.fn()} />);
    const second = render(<Harness open onClose={vi.fn()} />);

    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    second.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('calls the latest onClose after a rerender', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness open onClose={first} />);

    rerender(<Harness open onClose={second} />);
    pressEscape();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
