import { logger } from '@cuewise/shared';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('says so when a photo fails to load, since keeping the previous one looks like nothing happened', async () => {
    stubImage(undefined, true);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    render(
      <BackgroundImage url="https://example.com/dead.jpg" isLoading={false} dim={0} blur={0} />
    );

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to load'), {
        url: 'https://example.com/dead.jpg',
      })
    );
  });

  it('applies the readability filter to the image layer when dim and blur are set', async () => {
    render(<BackgroundImage url="https://example.com/a.jpg" isLoading={false} dim={40} blur={8} />);

    const layer = await screen.findByRole('img', { name: 'Focus mode background' });
    expect(layer.style.filter).toBe('brightness(0.6) blur(8px)');
    expect(layer.style.margin).toBe('-16px');
  });
});
