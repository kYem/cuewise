import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from './__fixtures__/motion.fixtures';
import { AnimatedCheckbox } from './AnimatedCheckbox';

describe('AnimatedCheckbox', () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the unchecked ring with no check path', () => {
    const { getByTestId, container } = render(<AnimatedCheckbox checked={false} />);
    expect(getByTestId('animated-checkbox').getAttribute('data-state')).toBe('unchecked');
    expect(container.querySelector('path')).toBeNull();
  });

  it('is aria-hidden so the wrapping button owns the label', () => {
    const { getByTestId } = render(<AnimatedCheckbox checked={false} />);
    expect(getByTestId('animated-checkbox').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the check statically when mounted already checked (no spin)', () => {
    const { getByTestId, container } = render(<AnimatedCheckbox checked={true} />);
    expect(getByTestId('animated-checkbox').getAttribute('data-state')).toBe('checked');
    expect(getByTestId('animated-checkbox').getAttribute('data-phase')).toBe('idle');
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('runs spin then draw then idle on a false to true toggle', () => {
    const { getByTestId, rerender } = render(<AnimatedCheckbox checked={false} />);

    act(() => {
      rerender(<AnimatedCheckbox checked={true} />);
    });
    expect(getByTestId('animated-checkbox').getAttribute('data-phase')).toBe('spin');

    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(getByTestId('animated-checkbox').getAttribute('data-phase')).toBe('draw');

    act(() => {
      vi.advanceTimersByTime(440);
    });
    expect(getByTestId('animated-checkbox').getAttribute('data-phase')).toBe('idle');
  });

  it('does not spin under prefers-reduced-motion', () => {
    setReducedMotion(true);
    const { getByTestId, rerender } = render(<AnimatedCheckbox checked={false} />);

    act(() => {
      rerender(<AnimatedCheckbox checked={true} />);
    });

    expect(getByTestId('animated-checkbox').getAttribute('data-phase')).toBe('idle');
    expect(getByTestId('animated-checkbox').getAttribute('data-state')).toBe('checked');
  });

  it('returns to idle unchecked when toggled back off', () => {
    const { getByTestId, rerender, container } = render(<AnimatedCheckbox checked={true} />);

    act(() => {
      rerender(<AnimatedCheckbox checked={false} />);
    });

    expect(getByTestId('animated-checkbox').getAttribute('data-phase')).toBe('idle');
    expect(getByTestId('animated-checkbox').getAttribute('data-state')).toBe('unchecked');
    expect(container.querySelector('path')).toBeNull();
  });
});
