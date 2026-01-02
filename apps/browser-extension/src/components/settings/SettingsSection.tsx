import type { LucideIcon } from 'lucide-react';
import type React from 'react';

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

/**
 * A wrapper component for settings sections.
 * Provides consistent header and padding styling.
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  icon: Icon,
  title,
  children,
}) => {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
      </div>
      <div className="space-y-4 pl-7">{children}</div>
    </section>
  );
};
