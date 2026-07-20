import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('@cuewise/storage', () => ({
  getDailyBackground: vi.fn(),
  setDailyBackground: vi.fn(),
}));
vi.mock('./unsplash', () => ({
  getRandomImageUrl: vi.fn(() => 'https://img/random'),
  loadImageWithFallback: vi.fn(),
  preloadImage: vi.fn(),
}));

import { getDailyBackground, setDailyBackground } from '@cuewise/storage';
import {
  clearPreloadCache,
  getPreloadedCurrentUrl,
  preloadImages,
  refreshBackground,
  setCustomBackgroundOverride,
} from './image-preload-cache';
import { loadImageWithFallback, preloadImage } from './unsplash';

const mockGetDaily = getDailyBackground as unknown as Mock;
const mockSetDaily = setDailyBackground as unknown as Mock;
const mockLoadFallback = loadImageWithFallback as unknown as Mock;
const mockPreload = preloadImage as unknown as Mock;

describe('preloadImages daily background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreloadCache();
    mockSetDaily.mockResolvedValue({ success: true });
    mockLoadFallback.mockResolvedValue('https://img/next');
  });

  it('picks and persists a validated image when there is no daily background', async () => {
    mockGetDaily.mockResolvedValue(null);
    mockLoadFallback.mockResolvedValue('https://img/valid');

    await preloadImages('nature');

    expect(mockSetDaily).toHaveBeenCalledWith('https://img/valid', 'nature');
    expect(getPreloadedCurrentUrl('nature')).toBe('https://img/valid');
  });

  it('re-picks and re-persists when the stored daily background no longer loads (404)', async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/dead', category: 'nature', date: 'today' });
    mockPreload.mockRejectedValueOnce(new Error('404'));
    mockLoadFallback.mockResolvedValue('https://img/fresh');

    await preloadImages('nature');

    expect(getPreloadedCurrentUrl('nature')).toBe('https://img/fresh');
    expect(mockSetDaily).toHaveBeenCalledWith('https://img/fresh', 'nature');
  });

  it('keeps a valid stored daily background without re-persisting it', async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/good', category: 'nature', date: 'today' });
    mockPreload.mockResolvedValue('https://img/good');

    await preloadImages('nature');

    expect(mockPreload).toHaveBeenCalledWith('https://img/good', 8000);
    expect(getPreloadedCurrentUrl('nature')).toBe('https://img/good');
    expect(mockSetDaily).not.toHaveBeenCalled();
  });

  it('skips re-resolving when already initialized for the same category', async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/good', category: 'nature', date: 'today' });
    mockPreload.mockResolvedValue('https://img/good');

    await preloadImages('nature');
    vi.clearAllMocks();
    await preloadImages('nature');

    expect(mockGetDaily).not.toHaveBeenCalled();
    expect(mockLoadFallback).not.toHaveBeenCalled();
    expect(mockSetDaily).not.toHaveBeenCalled();
  });

  it('does not persist a dead URL when every source fails', async () => {
    mockGetDaily.mockResolvedValue(null);
    mockLoadFallback.mockRejectedValue(new Error('all failed'));

    await preloadImages('nature');

    expect(getPreloadedCurrentUrl('nature')).toBeNull();
    expect(mockSetDaily).not.toHaveBeenCalled();
  });
});

describe('refreshBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreloadCache();
    mockSetDaily.mockResolvedValue({ success: true });
  });

  it('replaces the stored background with a freshly validated image', async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/today', category: 'nature', date: 'today' });
    mockPreload.mockResolvedValue('https://img/today');
    await preloadImages('nature');
    mockLoadFallback.mockResolvedValue('https://img/chosen');

    const url = await refreshBackground('nature');

    expect(url).toBe('https://img/chosen');
    expect(getPreloadedCurrentUrl('nature')).toBe('https://img/chosen');
    expect(mockSetDaily).toHaveBeenCalledWith('https://img/chosen', 'nature');
  });

  it('ignores the persisted background instead of revalidating it', async () => {
    mockLoadFallback.mockResolvedValue('https://img/chosen');

    await refreshBackground('nature');

    expect(mockGetDaily).not.toHaveBeenCalled();
  });

  it('keeps the current background when no fresh image can be loaded', async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/today', category: 'nature', date: 'today' });
    mockPreload.mockResolvedValue('https://img/today');
    await preloadImages('nature');
    vi.clearAllMocks();
    mockLoadFallback.mockRejectedValue(new Error('all failed'));

    const url = await refreshBackground('nature');

    expect(url).toBeNull();
    expect(getPreloadedCurrentUrl('nature')).toBe('https://img/today');
    expect(mockSetDaily).not.toHaveBeenCalled();
  });
});

describe('custom background override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPreloadCache();
    setCustomBackgroundOverride(null);
    mockSetDaily.mockResolvedValue({ success: true });
  });

  it("shows the user's own image instead of the curated photo", async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/daily', category: 'nature', date: 'today' });
    mockPreload.mockResolvedValue('https://img/daily');
    await preloadImages('nature');
    setCustomBackgroundOverride('data:image/jpeg;base64,mine');

    expect(getPreloadedCurrentUrl('nature')).toBe('data:image/jpeg;base64,mine');
  });

  it('applies to every category, since a custom image is not category-specific', () => {
    setCustomBackgroundOverride('data:image/jpeg;base64,mine');

    expect(getPreloadedCurrentUrl('ocean')).toBe('data:image/jpeg;base64,mine');
    expect(getPreloadedCurrentUrl('dark')).toBe('data:image/jpeg;base64,mine');
  });

  it('fetches no curated photo while the override is set', async () => {
    setCustomBackgroundOverride('data:image/jpeg;base64,mine');

    await preloadImages('nature');

    expect(mockGetDaily).not.toHaveBeenCalled();
    expect(mockLoadFallback).not.toHaveBeenCalled();
  });

  it('restores the curated rotation once the override is cleared', async () => {
    mockGetDaily.mockResolvedValue({ url: 'https://img/daily', category: 'nature', date: 'today' });
    mockPreload.mockResolvedValue('https://img/daily');
    await preloadImages('nature');
    setCustomBackgroundOverride('data:image/jpeg;base64,mine');

    setCustomBackgroundOverride(null);

    expect(getPreloadedCurrentUrl('nature')).toBe('https://img/daily');
  });
});
