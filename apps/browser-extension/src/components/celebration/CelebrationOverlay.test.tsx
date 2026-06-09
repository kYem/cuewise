import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { render } from '@testing-library/react';
import type { AnimationItem } from 'lottie-web';
import lottie from 'lottie-web/build/player/lottie_light';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCelebrationStore } from '../../stores/celebration-store';
import { useSettingsStore } from '../../stores/settings-store';
import { CelebrationOverlay } from './CelebrationOverlay';

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: { loadAnimation: vi.fn() },
}));

let completeHandler: (() => void) | null = null;

function fakeAnimation(): AnimationItem {
  const addEventListener = vi.fn((name: string, cb: () => void) => {
    if (name === 'complete') {
      completeHandler = cb;
    }
  });
  return { addEventListener, destroy: vi.fn() } as unknown as AnimationItem;
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

function setCelebrationsEnabled(enabled: boolean) {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, celebrationsEnabled: enabled },
  });
}

describe('CelebrationOverlay', () => {
  beforeEach(() => {
    completeHandler = null;
    vi.mocked(lottie.loadAnimation).mockReset();
    vi.mocked(lottie.loadAnimation).mockImplementation(() => fakeAnimation());
    useCelebrationStore.setState({ active: null });
    setReducedMotion(false);
    setCelebrationsEnabled(true);
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  it('renders nothing when no celebration is active', () => {
    render(<CelebrationOverlay />);
    expect(lottie.loadAnimation).not.toHaveBeenCalled();
  });

  it('plays the animation when a celebration is active', () => {
    useCelebrationStore.setState({ active: 'pomodoro' });
    render(<CelebrationOverlay />);
    expect(lottie.loadAnimation).toHaveBeenCalledTimes(1);
  });

  it('dismisses (clears active) when the animation completes', () => {
    useCelebrationStore.setState({ active: 'pomodoro' });
    render(<CelebrationOverlay />);

    expect(completeHandler).not.toBeNull();
    if (completeHandler !== null) {
      completeHandler();
    }

    expect(useCelebrationStore.getState().active).toBe(null);
  });

  it('renders nothing and clears active when celebrations are disabled', () => {
    setCelebrationsEnabled(false);
    useCelebrationStore.setState({ active: 'allGoals' });

    render(<CelebrationOverlay />);

    expect(lottie.loadAnimation).not.toHaveBeenCalled();
    expect(useCelebrationStore.getState().active).toBe(null);
  });

  it('renders nothing under prefers-reduced-motion', () => {
    setReducedMotion(true);
    useCelebrationStore.setState({ active: 'pomodoro' });

    render(<CelebrationOverlay />);

    expect(lottie.loadAnimation).not.toHaveBeenCalled();
    expect(useCelebrationStore.getState().active).toBe(null);
  });
});
