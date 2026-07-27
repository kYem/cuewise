import type { StorageResult } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import { BackgroundEffectControls } from './BackgroundEffectControls';

vi.mock('@cuewise/storage', () => ({
  clearSettings: vi.fn(),
  ensureSettingsMigrated: vi.fn(),
  getSettings: vi.fn(),
  migrateStorageData: vi.fn(),
  setSettingsPatch: vi.fn(),
}));

vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

describe('BackgroundEffectControls', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: defaultSettings,
      preview: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    vi.mocked(storage.setSettingsPatch).mockResolvedValue({ success: true });
    vi.mocked(storage.clearSettings).mockResolvedValue(true);
    vi.mocked(storage.ensureSettingsMigrated).mockResolvedValue(undefined);
  });

  it('renders both sliders at their persisted values', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, backgroundDim: 30, backgroundBlur: 5 },
    });

    render(<BackgroundEffectControls />);

    expect(screen.getByRole('slider', { name: 'Dim background' })).toHaveValue('30');
    expect(screen.getByRole('slider', { name: 'Blur background' })).toHaveValue('5');
  });

  it('previews while dragging without persisting', () => {
    render(<BackgroundEffectControls />);

    fireEvent.change(screen.getByRole('slider', { name: 'Dim background' }), {
      target: { value: '40' },
    });

    expect(useSettingsStore.getState().preview).toEqual({ backgroundDim: 40 });
    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
  });

  it('persists the dragged value when the drag is released', async () => {
    render(<BackgroundEffectControls />);
    const dimSlider = screen.getByRole('slider', { name: 'Dim background' });

    fireEvent.change(dimSlider, { target: { value: '40' } });
    fireEvent.pointerUp(dimSlider);

    await waitFor(() => {
      expect(storage.setSettingsPatch).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundDim: 40 })
      );
    });
  });

  it('persists a keyboard-adjusted value on key release', async () => {
    render(<BackgroundEffectControls />);
    const dimSlider = screen.getByRole('slider', { name: 'Dim background' });

    fireEvent.change(dimSlider, { target: { value: '15' } });
    fireEvent.keyUp(dimSlider, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(storage.setSettingsPatch).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundDim: 15 })
      );
    });
  });

  it('persists the previewed value when a touch gesture is cancelled', async () => {
    render(<BackgroundEffectControls />);
    const dimSlider = screen.getByRole('slider', { name: 'Dim background' });

    fireEvent.change(dimSlider, { target: { value: '25' } });
    fireEvent.pointerCancel(dimSlider);

    await waitFor(() => {
      expect(storage.setSettingsPatch).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundDim: 25 })
      );
    });
  });

  it('does not write anything when focus passes through without a change', () => {
    render(<BackgroundEffectControls />);
    const dimSlider = screen.getByRole('slider', { name: 'Dim background' });

    fireEvent.keyUp(dimSlider, { key: 'Tab' });
    fireEvent.blur(dimSlider);

    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
  });

  it('a drag that returns to its starting value persists it and clears the preview', async () => {
    render(<BackgroundEffectControls />);
    const dimSlider = screen.getByRole('slider', { name: 'Dim background' });

    fireEvent.change(dimSlider, { target: { value: '40' } });
    fireEvent.change(dimSlider, { target: { value: '0' } });
    fireEvent.pointerUp(dimSlider);

    await waitFor(() => {
      expect(storage.setSettingsPatch).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundDim: 0, backgroundBlur: 0 })
      );
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().preview).toBeNull();
    });
  });

  it('a gesture landing on the pre-write value still persists while a commit is in flight', async () => {
    let resolveFirstWrite: (result: StorageResult) => void = () => {};
    vi.mocked(storage.setSettingsPatch)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstWrite = resolve;
        })
      )
      .mockResolvedValue({ success: true });
    render(<BackgroundEffectControls />);
    const dimSlider = screen.getByRole('slider', { name: 'Dim background' });

    fireEvent.change(dimSlider, { target: { value: '1' } });
    fireEvent.keyUp(dimSlider, { key: 'ArrowRight' });
    fireEvent.change(dimSlider, { target: { value: '0' } });
    fireEvent.keyUp(dimSlider, { key: 'ArrowLeft' });
    resolveFirstWrite({ success: true });

    await waitFor(() => {
      expect(storage.setSettingsPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ backgroundDim: 0 })
      );
    });
  });

  it('discards an uncommitted preview when the controls unmount mid-drag', () => {
    const { unmount } = render(<BackgroundEffectControls />);

    fireEvent.change(screen.getByRole('slider', { name: 'Dim background' }), {
      target: { value: '60' },
    });
    unmount();

    expect(useSettingsStore.getState().preview).toBeNull();
    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
  });

  it('hides the reset button at the defaults', () => {
    render(<BackgroundEffectControls />);

    expect(screen.queryByRole('button', { name: 'Reset background effects' })).toBeNull();
  });

  it('reset persists both controls back to their defaults', async () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, backgroundDim: 30, backgroundBlur: 5 },
    });

    render(<BackgroundEffectControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset background effects' }));

    await waitFor(() => {
      expect(storage.setSettingsPatch).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundDim: 0, backgroundBlur: 0 })
      );
    });
  });
});
