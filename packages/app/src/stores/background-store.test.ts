import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('@cuewise/storage', () => ({
  getCustomBackground: vi.fn(),
  setCustomBackground: vi.fn(),
  clearCustomBackground: vi.fn(),
}));
vi.mock('../utils/image-preload-cache', () => ({ setCustomBackgroundOverride: vi.fn() }));

import { clearCustomBackground, getCustomBackground, setCustomBackground } from '@cuewise/storage';
import { setCustomBackgroundOverride } from '../utils/image-preload-cache';
import { useBackgroundStore } from './background-store';

const mockGet = getCustomBackground as unknown as Mock;
const mockSet = setCustomBackground as unknown as Mock;
const mockClear = clearCustomBackground as unknown as Mock;
const mockOverride = setCustomBackgroundOverride as unknown as Mock;

const IMAGE = 'data:image/jpeg;base64,stored';
const FAILURE = { success: false, error: { type: 'quota_exceeded', message: 'too big' } } as const;

describe('background store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBackgroundStore.setState({ customBackground: null, isLoaded: false });
    mockSet.mockResolvedValue({ success: true });
    mockClear.mockResolvedValue({ success: true });
  });

  it('adopts the stored image on load', async () => {
    mockGet.mockResolvedValue(IMAGE);

    await useBackgroundStore.getState().loadCustomBackground();

    expect(useBackgroundStore.getState().customBackground).toBe(IMAGE);
  });

  it('marks itself loaded even when no image is stored, so the page stops waiting', async () => {
    mockGet.mockResolvedValue(null);

    await useBackgroundStore.getState().loadCustomBackground();

    expect(useBackgroundStore.getState().isLoaded).toBe(true);
    expect(useBackgroundStore.getState().customBackground).toBeNull();
  });

  it('still releases the page when storage cannot be read', async () => {
    mockGet.mockRejectedValue(new Error('storage unavailable'));

    await useBackgroundStore.getState().loadCustomBackground();

    // isLoaded gates rendering; leaving it false would blank the glass theme forever.
    expect(useBackgroundStore.getState().isLoaded).toBe(true);
    expect(useBackgroundStore.getState().customBackground).toBeNull();
  });

  it('keeps a saved image in memory and in the shared background cache', async () => {
    await useBackgroundStore.getState().saveCustomBackground(IMAGE);

    expect(useBackgroundStore.getState().customBackground).toBe(IMAGE);
    expect(mockOverride).toHaveBeenCalledWith(IMAGE);
  });

  it('does not adopt an image storage refused', async () => {
    mockSet.mockResolvedValue(FAILURE);

    const result = await useBackgroundStore.getState().saveCustomBackground(IMAGE);

    expect(result.success).toBe(false);
    expect(useBackgroundStore.getState().customBackground).toBeNull();
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('drops the image once it is removed', async () => {
    useBackgroundStore.setState({ customBackground: IMAGE });

    await useBackgroundStore.getState().removeCustomBackground();

    expect(useBackgroundStore.getState().customBackground).toBeNull();
    expect(mockOverride).toHaveBeenCalledWith(null);
  });

  it('keeps showing the image when the delete failed, rather than pretending it is gone', async () => {
    useBackgroundStore.setState({ customBackground: IMAGE });
    mockClear.mockResolvedValue(FAILURE);

    const result = await useBackgroundStore.getState().removeCustomBackground();

    expect(result.success).toBe(false);
    expect(useBackgroundStore.getState().customBackground).toBe(IMAGE);
  });
});

describe('background store load safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBackgroundStore.setState({ customBackground: null, isLoaded: false });
  });

  it('releases the page when the storage read never settles', async () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue(new Promise(() => undefined));

    useBackgroundStore.getState().loadCustomBackground();
    await vi.advanceTimersByTimeAsync(3000);

    // Pages hide their content until isLoaded; a hung read must not blank the app forever.
    expect(useBackgroundStore.getState().isLoaded).toBe(true);
    vi.useRealTimers();
  });

  it('says the read failed rather than implying no image was ever set', async () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue(new Promise(() => undefined));

    useBackgroundStore.getState().loadCustomBackground();
    await vi.advanceTimersByTimeAsync(3000);

    expect(useBackgroundStore.getState().loadFailed).toBe(true);
    vi.useRealTimers();
  });

  it('still applies a slow read once it lands', async () => {
    vi.useFakeTimers();
    let settle: (value: string) => void = () => undefined;
    mockGet.mockReturnValue(
      new Promise<string>((r) => {
        settle = r;
      })
    );

    useBackgroundStore.getState().loadCustomBackground();
    await vi.advanceTimersByTimeAsync(3000);
    settle(IMAGE);
    await vi.advanceTimersByTimeAsync(0);

    expect(useBackgroundStore.getState().customBackground).toBe(IMAGE);
    expect(useBackgroundStore.getState().loadFailed).toBe(false);
    vi.useRealTimers();
  });

  it('does not let a slow read undo an image the user saved meanwhile', async () => {
    vi.useFakeTimers();
    let settle: (value: string | null) => void = () => undefined;
    mockGet.mockReturnValue(
      new Promise<string | null>((r) => {
        settle = r;
      })
    );

    useBackgroundStore.getState().loadCustomBackground();
    await useBackgroundStore.getState().saveCustomBackground(IMAGE);
    settle(null);
    await vi.advanceTimersByTimeAsync(0);

    expect(useBackgroundStore.getState().customBackground).toBe(IMAGE);
    vi.useRealTimers();
  });
});
