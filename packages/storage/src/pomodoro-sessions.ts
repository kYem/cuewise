import { type PomodoroSession, pomodoroSessionSchema, STORAGE_KEYS } from '@cuewise/shared';
import {
  getValidatedListFromStorage,
  type StorageResult,
  setInStorage,
  setValidatedListInStorage,
} from './chrome-storage';
import { getListRaw } from './raw-list';
import { getStorageArea } from './settings';

// Pomodoro Sessions
export async function getPomodoroSessions(): Promise<PomodoroSession[]> {
  const area = await getStorageArea();
  const sessions = await getValidatedListFromStorage<PomodoroSession>(
    STORAGE_KEYS.POMODORO_SESSIONS,
    pomodoroSessionSchema,
    area
  );
  return sessions ?? [];
}

export async function setPomodoroSessions(sessions: PomodoroSession[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(
    STORAGE_KEYS.POMODORO_SESSIONS,
    sessions,
    pomodoroSessionSchema,
    area
  );
}

export async function getPomodoroSessionsRaw(): Promise<PomodoroSession[]> {
  return getListRaw<PomodoroSession>(STORAGE_KEYS.POMODORO_SESSIONS, await getStorageArea());
}

export async function setPomodoroSessionsRaw(sessions: PomodoroSession[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, await getStorageArea());
}
