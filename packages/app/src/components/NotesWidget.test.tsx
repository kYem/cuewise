import { createSettingsStoreMock } from '@cuewise/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settings-store';
import { NotesWidget } from './NotesWidget';

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

interface StoreOptions {
  note?: string;
  notesExpanded?: boolean;
  saveSucceeds?: boolean;
}

function mockStore({ note = '', notesExpanded = false, saveSucceeds = true }: StoreOptions = {}) {
  const updateSettings: Mock = vi.fn().mockResolvedValue(saveSucceeds);
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ note, notesExpanded, updateSettings })
  );
  return { updateSettings };
}

async function openPad() {
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  return screen.findByRole('textbox', { name: 'Notes' });
}

/** Lets queued promises settle without letting the debounce timer fire. */
async function settle() {
  await act(async () => {});
}

describe('NotesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the stored note already in the pad', async () => {
    mockStore({ note: 'buy milk' });
    render(<NotesWidget />);

    const pad = await openPad();

    expect(pad).toHaveValue('buy milk');
  });

  it('writes once for a burst of typing, not once per keystroke', async () => {
    const { updateSettings } = mockStore();
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
    const { updateSettings } = mockStore();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'half a thought' } });
    fireEvent.keyDown(pad, { key: 'Escape' });
    // Asserted before the debounce could have fired: otherwise the timer satisfies this on its own
    // and the test passes with the flush deleted.
    await settle();

    expect(updateSettings).toHaveBeenCalledWith({ note: 'half a thought' });
  });

  it('flushes a pending write when the tab is hidden', async () => {
    const { updateSettings } = mockStore();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'closing the laptop' } });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await settle();

    expect(updateSettings).toHaveBeenCalledWith({ note: 'closing the laptop' });
  });

  it('writes nothing when the pad is opened and closed without typing', async () => {
    const { updateSettings } = mockStore({ note: 'existing note' });
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.keyDown(pad, { key: 'Escape' });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps the text and retries it when a save fails', async () => {
    const { updateSettings } = mockStore({ saveSucceeds: false });
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'precious' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(updateSettings).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(pad, { key: 'Escape' });
    await settle();

    expect(updateSettings).toHaveBeenNthCalledWith(2, { note: 'precious' });
  });

  it('does not overwrite unsaved text with the stored note when reopened', async () => {
    mockStore({ note: 'stored', saveSucceeds: false });
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'unsaved work' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.keyDown(pad, { key: 'Escape' });
    await settle();

    expect(await openPad()).toHaveValue('unsaved work');
  });

  it('adopts a note that changed underneath it while nothing is unsaved', async () => {
    mockStore({ note: 'first' });
    const { rerender } = render(<NotesWidget />);
    expect(await openPad()).toHaveValue('first');

    mockStore({ note: 'pulled from another device' });
    rerender(<NotesWidget />);

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'pulled from another device'
    );
  });

  it('caps the note so one key cannot exceed a sync record', async () => {
    mockStore();
    render(<NotesWidget />);

    expect(await openPad()).toHaveAttribute('maxlength', '8000');
  });

  it('shows a saved badge only after a write lands', async () => {
    mockStore();
    render(<NotesWidget />);
    const pad = await openPad();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    fireEvent.change(pad, { target: { value: 'done' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('remembers that the pad was expanded, so it opens big next time', async () => {
    const { updateSettings } = mockStore();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.click(screen.getByRole('button', { name: 'Expand notes' }));

    expect(updateSettings).toHaveBeenCalledWith({ notesExpanded: true });
    expect(pad.className).toContain('h-[60vh]');
  });

  it('opens at the larger size when it was left expanded', async () => {
    mockStore({ notesExpanded: true });
    render(<NotesWidget />);

    const pad = await openPad();

    expect(pad.className).toContain('h-[60vh]');
    expect(screen.getByRole('button', { name: 'Shrink notes' })).toBeInTheDocument();
  });

  it('keeps what you typed when the pad is expanded mid-note', async () => {
    mockStore();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'mid-thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand notes' }));

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('mid-thought');
  });
});
