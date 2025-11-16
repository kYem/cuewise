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
      value: 'default',
      label: 'Purple',
      gradient: 'linear-gradient(to bottom right, #faf5ff, #eff6ff, #e0e7ff)',
    },
    {
      value: 'ocean',
      label: 'Ocean',
      gradient: 'linear-gradient(to bottom right, #f0f9ff, #e0f2fe, #bae6fd)',
    },
    {
      value: 'forest',
      label: 'Forest',
      gradient: 'linear-gradient(to bottom right, #f0fdf4, #dcfce7, #bbf7d0)',
    },
    {
      value: 'sunset',
      label: 'Sunset',
      gradient: 'linear-gradient(to bottom right, #fff7ed, #ffedd5, #fed7aa)',
    },
    {
      value: 'lavender',
      label: 'Lavender',
      gradient: 'linear-gradient(to bottom right, #faf5ff, #f3e8ff, #e9d5ff)',
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
    <div className="w-80 flex-shrink-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header with Close Button */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Live Theme Preview</h2>
          <button
            type="button"
            onClick={() => updateSettings({ showThemeSwitcher: false })}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Close theme switcher"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Light/Dark/Auto */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Mode</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => updateTheme('light')}
              className={`p-3 rounded-lg transition-all flex flex-col items-center gap-2 ${
                settings.theme === 'light'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <SunMoon className="w-5 h-5" />
              <span className="text-xs font-medium">Auto</span>
            </button>
          </div>
        </section>

        {/* Color Themes */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Color Theme
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {colorThemes.map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => updateColorTheme(theme.value)}
                className={`relative overflow-hidden rounded-lg transition-all ${
                  settings.colorTheme === theme.value
                    ? 'ring-4 ring-primary-500 shadow-lg scale-105'
                    : 'ring-2 ring-gray-200 dark:ring-gray-700 hover:ring-primary-300 hover:scale-102'
                }`}
              >
                <div
                  className="h-20 w-full"
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

        {/* Layout Density */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Layout Density
          </h3>
          <div className="flex gap-2">
            {densities.map((density) => {
              const Icon = density.icon;
              return (
                <button
                  key={density.value}
                  type="button"
                  onClick={() => updateLayoutDensity(density.value)}
                  className={`flex-1 py-3 rounded-lg transition-all flex flex-col items-center gap-1 ${
                    settings.layoutDensity === density.value
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Changes apply instantly and are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
};
