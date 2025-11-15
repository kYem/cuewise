/**
 * Typed storage helpers for specific data types
 */

import {
  DEFAULT_SETTINGS,
  type Goal,
  type PomodoroSession,
  type Quote,
  type Reminder,
  type Settings,
  STORAGE_KEYS,
} from '@cuewise/shared';
import { getFromStorage, setInStorage } from './chrome-storage';

// Quotes
export async function getQuotes(): Promise<Quote[]> {
  const quotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES);
  return quotes ?? [];
}

export async function setQuotes(quotes: Quote[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.QUOTES, quotes);
}

export async function getCurrentQuote(): Promise<Quote | null> {
  return getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE);
}

export async function setCurrentQuote(quote: Quote): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.CURRENT_QUOTE, quote);
}

// Goals
export async function getGoals(): Promise<Goal[]> {
  const goals = await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS);
  return goals ?? [];
}

export async function setGoals(goals: Goal[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.GOALS, goals);
}

// Reminders
export async function getReminders(): Promise<Reminder[]> {
  const reminders = await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS);
  return reminders ?? [];
}

export async function setReminders(reminders: Reminder[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.REMINDERS, reminders);
}

// Pomodoro Sessions
export async function getPomodoroSessions(): Promise<PomodoroSession[]> {
  const sessions = await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS);
  return sessions ?? [];
}

export async function setPomodoroSessions(sessions: PomodoroSession[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions);
}

// Settings
export async function getSettings(): Promise<Settings> {
  const settings = await getFromStorage<Settings>(STORAGE_KEYS.SETTINGS);
  return settings ?? DEFAULT_SETTINGS;
}

export async function setSettings(settings: Settings): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.SETTINGS, settings);
}
