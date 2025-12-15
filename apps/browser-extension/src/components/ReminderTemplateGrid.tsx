import {
  formatHourMinute,
  REMINDER_CATEGORIES,
  REMINDER_TEMPLATES,
  type ReminderCategory,
  type ReminderTemplate,
} from '@cuewise/shared';
import {
  Activity,
  BookOpen,
  Briefcase,
  Coffee,
  Dumbbell,
  Eye,
  Heart,
  ListChecks,
  Pill,
  Sparkles,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

// Icon mapping for templates
const TEMPLATE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  water: Coffee,
  stretch: Activity,
  eyes: Eye,
  medication: Pill,
  exercise: Dumbbell,
  standup: Briefcase,
  review: ListChecks,
  'weekly-review': ListChecks,
  journal: BookOpen,
  gratitude: Heart,
};

// Category colors for visual grouping
const CATEGORY_COLORS: Record<ReminderCategory, string> = {
  health: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  productivity: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  personal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

// Frequency display labels
const FREQUENCY_LABELS: Record<'daily' | 'weekly' | 'monthly', string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

interface ReminderTemplateGridProps {
  onSelectTemplate: (template: ReminderTemplate) => void;
}

export const ReminderTemplateGrid: React.FC<ReminderTemplateGridProps> = ({ onSelectTemplate }) => {
  const [selectedCategory, setSelectedCategory] = useState<ReminderCategory | 'all'>('all');

  let filteredTemplates = REMINDER_TEMPLATES;
  if (selectedCategory !== 'all') {
    filteredTemplates = REMINDER_TEMPLATES.filter((t) => t.category === selectedCategory);
  }

  const categories: Array<ReminderCategory | 'all'> = ['all', 'health', 'productivity', 'personal'];

  return (
    <div className="space-y-4">
      {/* Category filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              selectedCategory === category
                ? 'bg-primary-600 text-white'
                : 'bg-surface-secondary text-secondary hover:bg-surface-tertiary'
            }`}
          >
            {category === 'all' ? 'All' : REMINDER_CATEGORIES[category]}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredTemplates.map((template) => {
          let Icon = TEMPLATE_ICONS[template.id];
          if (!Icon) {
            Icon = Sparkles;
          }
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template)}
              className="flex items-start gap-3 p-3 rounded-lg border-2 border-border hover:border-primary-500 hover:bg-surface-secondary transition-all text-left group"
            >
              <div
                className={`p-2 rounded-lg ${CATEGORY_COLORS[template.category]} group-hover:scale-110 transition-transform`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-primary text-sm truncate">{template.name}</div>
                <div className="text-xs text-secondary mt-0.5">
                  {FREQUENCY_LABELS[template.frequency]} at{' '}
                  {formatTemplateTime(template.defaultTime)}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-secondary text-center">
        Click a template to pre-fill the form. You can adjust the time before saving.
      </p>
    </div>
  );
};

// Helper to format time from HH:MM string to readable format
function formatTemplateTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return formatHourMinute(hours, minutes);
}
