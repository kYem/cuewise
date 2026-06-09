import { render, screen } from '@testing-library/react';
import type { AnimationConfigWithData, AnimationItem } from 'lottie-web';
import lottie from 'lottie-web/build/player/lottie_light';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: { loadAnimation: vi.fn() },
}));

function fakeAnimation(): AnimationItem {
  return { addEventListener: vi.fn(), destroy: vi.fn() } as unknown as AnimationItem;
}

function setReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const data = { v: '5.7.4', fr: 30, ip: 0, op: 60, w: 10, h: 10, layers: [] };

describe('EmptyState', () => {
  beforeEach(() => {
    vi.mocked(lottie.loadAnimation).mockReset();
    vi.mocked(lottie.loadAnimation).mockImplementation(() => fakeAnimation());
    setReducedMotion(false);
  });

  it('renders the title, description and children', () => {
    render(
      <EmptyState animationData={data} title="No tasks for today" description="Add your first task">
        <button type="button">Add</button>
      </EmptyState>
    );

    expect(screen.getByText('No tasks for today')).toBeInTheDocument();
    expect(screen.getByText('Add your first task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('loops and autoplays the illustration when motion is allowed', () => {
    render(<EmptyState animationData={data} title="No goals yet" />);

    const config = vi.mocked(lottie.loadAnimation).mock.calls[0][0] as AnimationConfigWithData;
    expect(config.loop).toBe(true);
    expect(config.autoplay).toBe(true);
  });

  it('renders a static frame (autoplay false) under prefers-reduced-motion', () => {
    setReducedMotion(true);
    render(<EmptyState animationData={data} title="No goals yet" />);

    const config = vi.mocked(lottie.loadAnimation).mock.calls[0][0] as AnimationConfigWithData;
    expect(config.autoplay).toBe(false);
    expect(config.loop).toBe(true);
  });
});
