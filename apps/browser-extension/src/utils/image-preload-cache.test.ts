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
import { clearPreloadCache, getPreloadedCurrentUrl, preloadImages } from './image-preload-cache';
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
