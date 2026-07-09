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
      updateColorTheme: vi.fn(),
      updateTheme: vi.fn(),
      updateLayoutDensity: vi.fn(),
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
