import { createSelectorMock, defaultSettings } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settings-store';
import { ThemeSwitcher } from './ThemeSwitcher';

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

function mockStore(overrides: Record<string, unknown> = {}) {
  const updateSettings = vi.fn();
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
      settings: { ...defaultSettings, ...overrides },
      updateSettings,
    })
  );
  return { updateSettings };
}

describe('ThemeSwitcher — Enhanced glass toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the toggle only when the Glass theme is active', () => {
    mockStore({ colorTheme: 'purple' });
    const { rerender } = render(<ThemeSwitcher isVisible />);
    expect(screen.queryByText('Enhanced glass')).not.toBeInTheDocument();

    mockStore({ colorTheme: 'glass' });
    rerender(<ThemeSwitcher isVisible />);
    expect(screen.getByText('Enhanced glass')).toBeInTheDocument();
  });

  it('toggles glassEnhanced when clicked', () => {
    const { updateSettings } = mockStore({ colorTheme: 'glass', glassEnhanced: false });
    render(<ThemeSwitcher isVisible />);

    fireEvent.click(screen.getByRole('button', { name: /Enhanced glass/ }));
    expect(updateSettings).toHaveBeenCalledWith({ glassEnhanced: true });
  });
});

describe('ThemeSwitcher — mode, color and density write through updateSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the selected mode', () => {
    const { updateSettings } = mockStore();
    render(<ThemeSwitcher isVisible />);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('writes the selected color theme', () => {
    const { updateSettings } = mockStore();
    render(<ThemeSwitcher isVisible />);

    fireEvent.click(screen.getByRole('button', { name: 'Forest' }));
    expect(updateSettings).toHaveBeenCalledWith({ colorTheme: 'forest' });
  });

  it('writes the selected density', () => {
    const { updateSettings } = mockStore();
    render(<ThemeSwitcher isVisible />);

    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(updateSettings).toHaveBeenCalledWith({ layoutDensity: 'compact' });
  });
});
