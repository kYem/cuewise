import { DEFAULT_SETTINGS, type Settings } from '@cuewise/shared';
import { type Mock, vi } from 'vitest';
import { create } from 'zustand';
import { type SettingsStore, useSettingsStore } from '../../stores/settings-store';

export interface NotesStoreOptions {
  note?: string;
  notesExpanded?: boolean;
  notesPinned?: boolean;
  saveSucceeds?: boolean;
  isLoading?: boolean;
}

/**
 * A real Zustand store behind the mocked hook: a test clicking pin only observes the flip if
 * the mock commits state and re-renders — like the real store, which commits persisted writes.
 */
export function mockNotesSettingsStore({
  note = '',
  notesExpanded = false,
  notesPinned = false,
  saveSucceeds = true,
  isLoading = false,
}: NotesStoreOptions = {}) {
  const store = create<SettingsStore>((set) => ({
    settings: { ...DEFAULT_SETTINGS, note, notesExpanded, notesPinned },
    preview: null,
    isLoading,
    error: null,
    initialize: vi.fn(async () => {}),
    previewSettings: vi.fn(),
    clearPreview: vi.fn(),
    updateSettings: vi.fn(async (patch: Partial<Settings>) => {
      if (!saveSucceeds) {
        return false;
      }
      set((state) => ({ settings: { ...state.settings, ...patch } }));
      return true;
    }),
    resetToDefaults: vi.fn(async () => true),
  }));
  vi.mocked(useSettingsStore).mockImplementation(store);
  return { updateSettings: store.getState().updateSettings as Mock };
}
