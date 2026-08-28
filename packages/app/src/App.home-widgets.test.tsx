import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { setReducedMotion } from './components/__fixtures__/motion.fixtures';

// jsdom has no IntersectionObserver; NewTabPage's sticky-header effect only
// needs the constructor to exist, never fires it here.
class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('App home widget discovery', () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.IntersectionObserver =
      StubIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  // The picker and the chip are covered in isolation; this is the only check that the
  // entry point is actually mounted on the page it exists to serve.
  it('puts the add-widget entry point on the new tab', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Add a widget' })).toBeInTheDocument();
  });
});
