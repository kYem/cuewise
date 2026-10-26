import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useClickOutside } from './useClickOutside';

interface HarnessProps {
  onClickOutside: () => void;
  enabled?: boolean;
}

function Harness({ onClickOutside, enabled }: HarnessProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside([triggerRef, menuRef], onClickOutside, enabled);
  return (
    <div>
      <button ref={triggerRef} type="button">
        trigger
      </button>
      <div ref={menuRef}>
        <span>menu item</span>
      </div>
      <p>elsewhere</p>
    </div>
  );
}

function SingleRefHarness({ onClickOutside }: HarnessProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClickOutside);
  return (
    <div>
      <div ref={ref}>inside</div>
      <p>elsewhere</p>
    </div>
  );
}

describe('useClickOutside', () => {
  it('fires on a mousedown outside every ref', () => {
    const onClickOutside = vi.fn();
    render(<Harness onClickOutside={onClickOutside} />);

    fireEvent.mouseDown(screen.getByText('elsewhere'));

    expect(onClickOutside).toHaveBeenCalledTimes(1);
  });

  it('ignores a mousedown inside any of the refs', () => {
    const onClickOutside = vi.fn();
    render(<Harness onClickOutside={onClickOutside} />);

    fireEvent.mouseDown(screen.getByText('trigger'));
    fireEvent.mouseDown(screen.getByText('menu item'));

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it('accepts a single ref', () => {
    const onClickOutside = vi.fn();
    render(<SingleRefHarness onClickOutside={onClickOutside} />);

    fireEvent.mouseDown(screen.getByText('inside'));
    fireEvent.mouseDown(screen.getByText('elsewhere'));

    expect(onClickOutside).toHaveBeenCalledTimes(1);
  });

  it('does not listen while disabled', () => {
    const onClickOutside = vi.fn();
    const { rerender } = render(<Harness onClickOutside={onClickOutside} enabled={false} />);

    fireEvent.mouseDown(screen.getByText('elsewhere'));
    expect(onClickOutside).not.toHaveBeenCalled();

    rerender(<Harness onClickOutside={onClickOutside} enabled />);
    fireEvent.mouseDown(screen.getByText('elsewhere'));
    expect(onClickOutside).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onClickOutside={first} />);

    rerender(<Harness onClickOutside={second} />);
    fireEvent.mouseDown(screen.getByText('elsewhere'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('ignores click events, only mousedown counts', () => {
    const onClickOutside = vi.fn();
    render(<Harness onClickOutside={onClickOutside} />);

    fireEvent.click(screen.getByText('elsewhere'));

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const onClickOutside = vi.fn();
    const { unmount } = render(<Harness onClickOutside={onClickOutside} />);

    unmount();
    fireEvent.mouseDown(document.body);

    expect(onClickOutside).not.toHaveBeenCalled();
  });
});
