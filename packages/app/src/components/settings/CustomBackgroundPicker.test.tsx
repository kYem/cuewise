import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('@cuewise/storage', () => ({
  getCustomBackground: vi.fn(),
  setCustomBackground: vi.fn(),
  clearCustomBackground: vi.fn(),
}));
vi.mock('../../utils/custom-background', () => ({
  fileToBackgroundDataUrl: vi.fn(),
  MAX_BACKGROUND_WIDTH: 1920,
}));

import { clearCustomBackground, getCustomBackground, setCustomBackground } from '@cuewise/storage';
import { fileToBackgroundDataUrl } from '../../utils/custom-background';
import { CustomBackgroundPicker } from './CustomBackgroundPicker';

const mockGet = getCustomBackground as unknown as Mock;
const mockSet = setCustomBackground as unknown as Mock;
const mockClear = clearCustomBackground as unknown as Mock;
const mockConvert = fileToBackgroundDataUrl as unknown as Mock;

const DATA_URL = 'data:image/jpeg;base64,converted';

function pickFile() {
  const input = screen.getByLabelText(/choose image/i);
  const file = new File(['x'], 'holiday.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('CustomBackgroundPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue({ success: true });
    mockClear.mockResolvedValue(true);
    mockConvert.mockResolvedValue(DATA_URL);
  });

  it('stores the downscaled image the user picks', async () => {
    render(<CustomBackgroundPicker onChange={vi.fn()} />);

    pickFile();

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith(DATA_URL));
  });

  it('announces the new background so the page can show it immediately', async () => {
    const onChange = vi.fn();
    render(<CustomBackgroundPicker onChange={onChange} />);

    pickFile();

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(DATA_URL));
  });

  it('warns instead of failing silently when the image is too large to store', async () => {
    mockSet.mockResolvedValue({ success: false, error: 'quota_exceeded' });
    const onChange = vi.fn();
    render(<CustomBackgroundPicker onChange={onChange} />);

    pickFile();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains when the chosen file is not a usable image', async () => {
    mockConvert.mockRejectedValue(new Error('That file is not an image we can display'));
    render(<CustomBackgroundPicker onChange={vi.fn()} />);

    pickFile();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('offers no remove control until an image is actually set', async () => {
    render(<CustomBackgroundPicker onChange={vi.fn()} />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('restores the curated rotation when the image is removed', async () => {
    mockGet.mockResolvedValue(DATA_URL);
    const onChange = vi.fn();
    render(<CustomBackgroundPicker onChange={onChange} />);

    const remove = await screen.findByRole('button', { name: /remove/i });
    fireEvent.click(remove);

    await waitFor(() => expect(mockClear).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
