import { describe, expect, it } from 'vitest';
import {
  getHostedArtTitle,
  HOSTED_ART,
  hostedArtUrl,
  isHostedArtUrl,
  isHostedCategory,
} from './hosted-art';

describe('hosted art', () => {
  it('captions an image with its slug as a title', () => {
    expect(getHostedArtTitle(hostedArtUrl('anime', 'rainy-blue-hour'))).toBe('Rainy blue hour');
  });

  it('gives no caption to an Unsplash photo', () => {
    expect(
      getHostedArtTitle('https://images.unsplash.com/photo-1469474968028-56623f02e42e')
    ).toBeNull();
  });

  it('does not claim a lookalike host as ours', () => {
    expect(isHostedArtUrl('https://assets.cuewise.app.evil.com/backgrounds/anime/x.webp')).toBe(
      false
    );
  });

  it('routes only the anime theme to hosted art', () => {
    expect(isHostedCategory('anime')).toBe(true);
    expect(isHostedCategory('japan')).toBe(false);
  });

  it.each(Object.entries(HOSTED_ART))(
    'builds a recognisable URL for every %s slug',
    (category, slugs) => {
      for (const slug of slugs) {
        expect(isHostedArtUrl(hostedArtUrl(category as 'anime', slug))).toBe(true);
      }
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  );
});
