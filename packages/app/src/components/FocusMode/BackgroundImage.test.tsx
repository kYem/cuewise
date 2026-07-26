import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubImage } from '../../utils/__fixtures__/custom-background.fixtures';
import { BackgroundImage } from './BackgroundImage';

describe('BackgroundImage', () => {
  beforeEach(() => {
    stubImage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies no filter to the image layer at default dim and blur', async () => {
    render(<BackgroundImage url="https://example.com/a.jpg" isLoading={false} dim={0} blur={0} />);

    const layer = await screen.findByRole('img', { name: 'Focus mode background' });
    expect(layer.style.filter).toBe('');
    expect(layer.style.margin).toBe('');
  });

  it('applies the readability filter to the image layer when dim and blur are set', async () => {
    render(<BackgroundImage url="https://example.com/a.jpg" isLoading={false} dim={40} blur={8} />);

    const layer = await screen.findByRole('img', { name: 'Focus mode background' });
    expect(layer.style.filter).toBe('brightness(0.6) blur(8px)');
    expect(layer.style.margin).toBe('-16px');
  });
});
