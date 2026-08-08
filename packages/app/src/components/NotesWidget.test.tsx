import { createSelectorMock } from '@cuewise/test-utils';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settings-store';
import { useToastStore } from '../stores/toast-store';
import { NotesWidget } from './NotesWidget';

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

function mockStores(note = '', updateSucceeds = true, notesExpanded = false) {
  const updateSettings = vi.fn().mockResolvedValue(updateSucceeds);
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({ settings: { note, notesExpanded }, updateSettings })
  );
  return { updateSettings };
}

async function openPad() {
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  return screen.findByRole('textbox', { name: 'Notes' });
}

describe('NotesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.getState().clearAll();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the stored note already in the pad', async () => {
    mockStores('buy milk');
    render(<NotesWidget />);

    const pad = await openPad();

    expect(pad).toHaveValue('buy milk');
  });

  it('writes once for a burst of typing, not once per keystroke', async () => {
    const { updateSettings } = mockStores();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'a' } });
    fireEvent.change(pad, { target: { value: 'ab' } });
    fireEvent.change(pad, { target: { value: 'abc' } });
    expect(updateSettings).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ note: 'abc' });
  });

  it('flushes a pending write when the pad closes, so the last words survive', async () => {
    const { updateSettings } = mockStores();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'half a thought' } });
    fireEvent.keyDown(pad, { key: 'Escape' });

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ note: 'half a thought' });
    });
  });

  it('flushes a pending write when the tab is hidden', async () => {
    const { updateSettings } = mockStores();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'closing the laptop' } });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ note: 'closing the laptop' });
    });
  });

  it('remembers that the pad was expanded, so it opens big next time', async () => {
    const { updateSettings } = mockStores();
    render(<NotesWidget />);
    await openPad();

    fireEvent.click(screen.getByRole('button', { name: 'Expand notes' }));

    expect(updateSettings).toHaveBeenCalledWith({ notesExpanded: true });
    expect(screen.getByRole('button', { name: 'Shrink notes' })).toBeInTheDocument();
  });

  it('opens at the larger size when it was left expanded', async () => {
    mockStores('', true, true);
    render(<NotesWidget />);
    await openPad();

    expect(screen.getByRole('button', { name: 'Shrink notes' })).toBeInTheDocument();
  });

  it('keeps what you typed when the pad is expanded mid-note', async () => {
    mockStores();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'mid-thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand notes' }));

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('mid-thought');
  });

  it('tells the user when the note failed to save', async () => {
    mockStores('', false);
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'unsaveable' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });
});
