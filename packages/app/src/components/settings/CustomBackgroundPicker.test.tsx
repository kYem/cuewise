import type { StorageResult } from '@cuewise/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('../../utils/custom-background', async () => {
  const actual = await vi.importActual<typeof import('../../utils/custom-background')>(
    '../../utils/custom-background'
  );
  return { ...actual, fileToBackgroundDataUrl: vi.fn() };
});

import { useBackgroundStore } from '../../stores/background-store';
import { BackgroundImageError, fileToBackgroundDataUrl } from '../../utils/custom-background';
import { CustomBackgroundPicker } from './CustomBackgroundPicker';

const mockConvert = fileToBackgroundDataUrl as unknown as Mock;

const DATA_URL = 'data:image/jpeg;base64,converted';
const QUOTA_FAILURE = {
  success: false,
  error: { type: 'quota_exceeded', message: 'too big' },
} as const;
const UNKNOWN_FAILURE = {
  success: false,
  error: { type: 'unknown', message: 'context invalidated' },
} as const;

function pickFile() {
  const input = screen.getByLabelText(/choose image/i);
  const file = new File(['x'], 'holiday.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

function stubStore(overrides: Partial<ReturnType<typeof useBackgroundStore.getState>> = {}) {
  useBackgroundStore.setState({
    customBackground: null,
    isLoaded: true,
    saveCustomBackground: vi.fn().mockResolvedValue({ success: true }),
    removeCustomBackground: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });
}

describe('CustomBackgroundPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvert.mockResolvedValue(DATA_URL);
    stubStore();
  });

  it('hands the downscaled image to the store', async () => {
    const saveCustomBackground = vi.fn().mockResolvedValue({ success: true });
    stubStore({ saveCustomBackground });
    render(<CustomBackgroundPicker />);

    pickFile();

    await waitFor(() => expect(saveCustomBackground).toHaveBeenCalledWith(DATA_URL));
  });

  it('says the image is too large when the quota refused it', async () => {
    stubStore({ saveCustomBackground: vi.fn().mockResolvedValue(QUOTA_FAILURE) });
    render(<CustomBackgroundPicker />);

    pickFile();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/too large/i));
  });

  it('does not blame the image size for a failure that was not about size', async () => {
    stubStore({ saveCustomBackground: vi.fn().mockResolvedValue(UNKNOWN_FAILURE) });
    render(<CustomBackgroundPicker />);

    pickFile();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/reload the page/i);
    expect(alert).not.toHaveTextContent(/too large/i);
  });

  it('explains when the chosen file is not a usable image', async () => {
    mockConvert.mockRejectedValue(new BackgroundImageError('Cuewise cannot read this format.'));
    render(<CustomBackgroundPicker />);

    pickFile();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cannot read/i));
  });

  it('hides an unexpected internal error behind a message meant for users', async () => {
    mockConvert.mockRejectedValue(new TypeError('cache.currentUrl is undefined'));
    render(<CustomBackgroundPicker />);

    pickFile();

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent(/undefined/i);
    expect(alert).toHaveTextContent(/could not be saved/i);
  });

  it('offers no remove control until an image is actually set', () => {
    render(<CustomBackgroundPicker />);

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('removes the image when asked', async () => {
    const removeCustomBackground = vi.fn().mockResolvedValue({ success: true });
    stubStore({ customBackground: DATA_URL, removeCustomBackground });
    render(<CustomBackgroundPicker />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(removeCustomBackground).toHaveBeenCalled());
  });

  it('warns that the image is still on the device when the delete failed', async () => {
    stubStore({
      customBackground: DATA_URL,
      removeCustomBackground: vi.fn().mockResolvedValue(UNKNOWN_FAILURE),
    });
    render(<CustomBackgroundPicker />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/still saved/i));
  });

  it('does not label a removal as saving', async () => {
    stubStore({
      customBackground: DATA_URL,
      removeCustomBackground: vi.fn(() => new Promise<StorageResult>(() => undefined)),
    });
    render(<CustomBackgroundPicker />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.getByLabelText(/choose image/i)).toBeDisabled());
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
  });

  it('blocks a second pick while one is already being saved', async () => {
    // Never resolves, so the component stays in its in-flight state for the assertion.
    stubStore({ saveCustomBackground: vi.fn(() => new Promise<StorageResult>(() => undefined)) });
    render(<CustomBackgroundPicker />);

    pickFile();

    await waitFor(() => expect(screen.getByLabelText(/choose image/i)).toBeDisabled());
  });
});
