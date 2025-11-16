import type { ColorTheme, LayoutDensity } from '@cuewise/shared';
import { Expand, Minimize, Moon, Sun, SunMoon, X } from 'lucide-react';
import type React from 'react';
import { useSettingsStore } from '../stores/settings-store';

interface ThemeSwitcherProps {
  isVisible: boolean;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ isVisible }) => {
  const { settings, updateColorTheme, updateTheme, updateLayoutDensity, updateSettings } =
    useSettingsStore();

  const colorThemes: { value: ColorTheme; label: string; gradient: string }[] = [
    {
      value: 'purple',
      label: 'Purple',
      gradient: 'linear-gradient(to bottom right, #faf5ff, #eff6ff, #e0e7ff)',
    },
    {
      value: 'forest',
      label: 'Forest',
      gradient: 'linear-gradient(to bottom right, #f0fdf4, #dcfce7, #bbf7d0)',
    },
    {
      value: 'rose',
      label: 'Rose',
      gradient: 'linear-gradient(to bottom right, #fff1f2, #ffe4e6, #fecdd3)',
    },
  ];

  const densities: { value: LayoutDensity; label: string; icon: typeof Minimize }[] = [
    { value: 'compact', label: 'Compact', icon: Minimize },
    { value: 'comfortable', label: 'Comfortable', icon: SunMoon },
    { value: 'spacious', label: 'Spacious', icon: Expand },
  ];

  if (!isVisible) return null;

  return (
    <div className="w-80 flex-shrink-0 bg-surface/95 backdrop-blur-sm border-l border-border overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header with Close Button */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-primary">Live Theme Preview</h2>
          <button
            type="button"
            onClick={() => updateSettings({ showThemeSwitcher: false })}
            className="p-2 rounded-lg hover:bg-surface-variant transition-colors"
            title="Close theme switcher"
          >
            <X className="w-5 h-5 text-secondary" />
          </button>
        </div>

        {/* Light/Dark/Auto */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-3">Mode</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => updateTheme('light')}
              className={`p-3 rounded-lg transition-all flex flex-col items-center gap-2 ${
                settings.theme === 'light'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-surface-variant text-primary hover:bg-border'
              }`}
            >
              <Sun className="w-5 h-5" />
              <span className="text-xs font-medium">Light</span>
            </button>
            <button
              type="button"
              onClick={() => updateTheme('dark')}
              className={`p-3 rounded-lg transition-all flex flex-col items-center gap-2 ${
                settings.theme === 'dark'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-surface-variant text-primary hover:bg-border'
              }`}
            >
              <Moon className="w-5 h-5" />
              <span className="text-xs font-medium">Dark</span>
            </button>
            <button
              type="button"
              onClick={() => updateTheme('auto')}
              className={`p-3 rounded-lg transition-all flex flex-col items-center gap-2 ${
                settings.theme === 'auto'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-surface-variant text-primary hover:bg-border'
              }`}
            >
              <SunMoon className="w-5 h-5" />
              <span className="text-xs font-medium">Auto</span>
            </button>
          </div>
        </section>

        {/* Color Themes */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-3">
            Color Theme
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {colorThemes.map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => updateColorTheme(theme.value)}
                className={`relative overflow-hidden rounded-lg transition-all ${
                  settings.colorTheme === theme.value
                    ? 'ring-4 ring-primary-500 shadow-lg scale-105'
                    : 'ring-2 ring-border hover:ring-primary-300 hover:scale-102'
                }`}
              >
                <div
                  className="h-12 w-full"
                  style={{
                    background: theme.gradient,
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm py-1">
                  <span className="text-xs font-medium text-white block text-center">
                    {theme.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Density */}
        <section>
          <h3 className="text-sm font-semibold text-primary mb-3">
            Density
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {densities.map((density) => {
              const Icon = density.icon;
              return (
                <button
                  key={density.value}
                  type="button"
                  onClick={() => updateLayoutDensity(density.value)}
                  className={`p-3 rounded-lg transition-all flex flex-col items-center gap-2 ${
                    settings.layoutDensity === density.value
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{density.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Info */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-secondary text-center">
            Changes apply instantly and are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
};
