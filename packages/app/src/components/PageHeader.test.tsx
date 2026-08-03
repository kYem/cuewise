import { COLOR_THEMES, type ColorTheme } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settings-store';
import { PageHeader } from './PageHeader';

vi.mock('../stores/settings-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stores/settings-store')>()),
  useSettingsStore: vi.fn(),
}));

function setup(colorTheme: ColorTheme) {
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({ settings: { ...defaultSettings, colorTheme } })
  );
}

const PLAIN_THEMES = (Object.keys(COLOR_THEMES) as ColorTheme[]).filter((t) => t !== 'glass');

function header() {
  return screen.getByRole('banner');
}

describe('PageHeader transparency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is transparent on the glass theme, where it sits over the photo', () => {
    setup('glass');

    render(<PageHeader currentPage="pomodoro" />);

    expect(header()).toHaveClass('bg-transparent');
  });

  it.each(
    PLAIN_THEMES
  )('is opaque on the %s theme, where there is no photo behind it', (colorTheme) => {
    setup(colorTheme);

    render(<PageHeader currentPage="pomodoro" />);

    expect(header()).not.toHaveClass('bg-transparent');
    expect(header()).toHaveClass('bg-surface/95');
  });

  it('lets an explicit prop override the theme it would have detected', () => {
    setup('purple');

    render(<PageHeader currentPage="pomodoro" transparent />);

    expect(header()).toHaveClass('bg-transparent');
  });

  it('lets an explicit prop force opacity on the glass theme', () => {
    setup('glass');

    render(<PageHeader currentPage="pomodoro" transparent={false} />);

    expect(header()).toHaveClass('bg-surface/95');
  });
});
