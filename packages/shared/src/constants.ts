import type { QuoteCategory, Settings } from './types';

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  enableNotifications: true,
  theme: 'light',
  quoteChangeInterval: 0, // 0 = manual (no auto-refresh)
  timeFormat: '12h',
};

// Quote categories with display names
export const QUOTE_CATEGORIES: Record<QuoteCategory, string> = {
  inspiration: 'Inspiration',
  learning: 'Learning',
  productivity: 'Productivity',
  mindfulness: 'Mindfulness',
  success: 'Success',
  creativity: 'Creativity',
  resilience: 'Resilience',
  leadership: 'Leadership',
  health: 'Health',
  growth: 'Growth',
};

// Category colors (for UI)
export const CATEGORY_COLORS: Record<QuoteCategory, string> = {
  inspiration: '#8B5CF6', // purple
  learning: '#3B82F6', // blue
  productivity: '#10B981', // green
  mindfulness: '#06B6D4', // cyan
  success: '#F59E0B', // amber
  creativity: '#EC4899', // pink
  resilience: '#EF4444', // red
  leadership: '#6366F1', // indigo
  health: '#14B8A6', // teal
  growth: '#84CC16', // lime
};
