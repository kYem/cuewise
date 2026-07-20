import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('@cuewise/storage', () => ({ getCustomBackground: vi.fn() }));

import { getCustomBackground } from '@cuewise/storage';
import { useBackgroundStore } from './background-store';

const mockGet = getCustomBackground as unknown as Mock;

describe('background store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBackgroundStore.setState({ customBackground: null, isLoaded: false });
  });

  it('starts with no custom background until storage is read', () => {
    expect(useBackgroundStore.getState().customBackground).toBeNull();
    expect(useBackgroundStore.getState().isLoaded).toBe(false);
  });

  it('adopts the stored image on load', async () => {
    mockGet.mockResolvedValue('data:image/jpeg;base64,stored');

    await useBackgroundStore.getState().loadCustomBackground();

    expect(useBackgroundStore.getState().customBackground).toBe('data:image/jpeg;base64,stored');
  });

  it('marks itself loaded even when no image is stored, so the page stops waiting', async () => {
    mockGet.mockResolvedValue(null);

    await useBackgroundStore.getState().loadCustomBackground();

    expect(useBackgroundStore.getState().isLoaded).toBe(true);
    expect(useBackgroundStore.getState().customBackground).toBeNull();
  });

  it('takes a newly chosen image without waiting for a reload', () => {
    useBackgroundStore.getState().setCustomBackground('data:image/jpeg;base64,fresh');

    expect(useBackgroundStore.getState().customBackground).toBe('data:image/jpeg;base64,fresh');
  });

  it('drops the image when it is removed', () => {
    useBackgroundStore.setState({ customBackground: 'data:image/jpeg;base64,old' });

    useBackgroundStore.getState().setCustomBackground(null);

    expect(useBackgroundStore.getState().customBackground).toBeNull();
  });
});
