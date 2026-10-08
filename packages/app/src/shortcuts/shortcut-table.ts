export type ShortcutId =
  | 'quote.next'
  | 'concept.show'
  | 'focus'
  | 'settings'
  | 'goal.add'
  | 'help'
  | 'go.home'
  | 'go.pomodoro'
  | 'go.insights'
  | 'go.quotes'
  | 'go.goals'
  | 'go.concepts';

export type ShortcutGroup = 'Quote' | 'Actions' | 'Go to';

export interface Shortcut {
  id: ShortcutId;
  keys: string[];
  label: string;
  group: ShortcutGroup;
  keywords: string[];
  /** The component listens for this key itself; the table only lists it. */
  boundBy?: 'component';
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'quote.next',
    keys: ['Space'],
    label: 'New quote',
    group: 'Quote',
    keywords: ['refresh', 'next'],
    boundBy: 'component',
  },
  {
    id: 'concept.show',
    keys: ['c'],
    label: 'Show due concept',
    group: 'Quote',
    keywords: ['card', 'review'],
    boundBy: 'component',
  },
  {
    id: 'focus',
    keys: ['f'],
    label: 'Focus mode',
    group: 'Actions',
    keywords: ['pomodoro', 'timer', 'zen'],
  },
  {
    id: 'settings',
    keys: ['s'],
    label: 'Settings',
    group: 'Actions',
    keywords: ['preferences', 'prefs', 'options'],
  },
  {
    id: 'goal.add',
    keys: ['n'],
    label: 'Add a goal',
    group: 'Actions',
    keywords: ['task', 'todo', 'new'],
  },
  {
    id: 'help',
    keys: ['?'],
    label: 'Keyboard shortcuts',
    group: 'Actions',
    keywords: ['help', 'keys', 'cheat sheet'],
  },
  { id: 'go.home', keys: ['g', 'h'], label: 'Home', group: 'Go to', keywords: ['new tab'] },
  {
    id: 'go.pomodoro',
    keys: ['g', 'p'],
    label: 'Pomodoro',
    group: 'Go to',
    keywords: ['timer', 'focus'],
  },
  {
    id: 'go.insights',
    keys: ['g', 'i'],
    label: 'Insights',
    group: 'Go to',
    keywords: ['stats', 'analytics'],
  },
  {
    id: 'go.quotes',
    keys: ['g', 'q'],
    label: 'Quotes',
    group: 'Go to',
    keywords: ['library', 'manage'],
  },
  {
    id: 'go.goals',
    keys: ['g', 'g'],
    label: 'Goals',
    group: 'Go to',
    keywords: ['tasks', 'objectives'],
  },
  {
    id: 'go.concepts',
    keys: ['g', 'c'],
    label: 'Concepts',
    group: 'Go to',
    keywords: ['cards', 'learn'],
  },
];

export function formatKeys(keys: string[]): string {
  return keys.join(' then ');
}
