import { MAX_NOTE_LENGTH } from '@cuewise/shared';
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
  notesPinned?: boolean;
  saveSucceeds?: boolean;
  isLoading?: boolean;
}

function mockStore({
  note = '',
  notesExpanded = false,
  notesPinned = false,
  saveSucceeds = true,
  isLoading = false,
}: StoreOptions = {}) {
  const updateSettings: Mock = vi.fn().mockResolvedValue(saveSucceeds);
  const base = createSettingsStoreMock({ note, notesExpanded, notesPinned, updateSettings });
  vi.mocked(useSettingsStore).mockImplementation((selector) =>
    base((state) => selector({ ...state, isLoading }))
  );
  return { updateSettings };
}

async function openPad() {
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  return screen.findByRole('textbox', { name: 'Notes' });
}

/** Settles promises without advancing the clock, so the debounce can't satisfy an assertion. */
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

  it('keeps unsaved text when a note arrives from another device', async () => {
    mockStore({ note: 'first', saveSucceeds: false });
    const { rerender } = render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'my unsaved words' } });
    mockStore({ note: 'pulled from another device', saveSucceeds: false });
    rerender(<NotesWidget />);

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('my unsaved words');
  });

  it('writes the newest text when a keystroke lands mid-save', async () => {
    let release = (_: boolean) => {};
    const updateSettings: Mock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (release = resolve)))
      .mockResolvedValue(true);
    vi.mocked(useSettingsStore).mockImplementation(
      createSettingsStoreMock({ note: '', updateSettings })
    );
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'first' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.change(pad, { target: { value: 'first second' } });
    await act(async () => {
      release(true);
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(updateSettings).toHaveBeenNthCalledWith(2, { note: 'first second' });
  });

  it('does not write before the debounce elapses', async () => {
    const { updateSettings } = mockStore();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'x' } });
    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(updateSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(updateSettings).toHaveBeenCalledWith({ note: 'x' });
  });

  it('flushes a pending write when the widget unmounts', async () => {
    const { updateSettings } = mockStore();
    const { unmount } = render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'switched off mid-note' } });
    unmount();
    await settle();

    expect(updateSettings).toHaveBeenCalledWith({ note: 'switched off mid-note' });
  });

  it('stays open on click away once pinned, and closes from its own button', async () => {
    mockStore();
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.click(screen.getByRole('button', { name: 'Keep notes open' }));
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument();
    fireEvent.keyDown(pad, { key: 'Escape' });
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close notes' }));

    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('closes on click away while unpinned', async () => {
    mockStore();
    render(<NotesWidget />);
    await openPad();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('reopens already pinned on a fresh tab', async () => {
    mockStore({ notesPinned: true, note: 'left open' });
    render(<NotesWidget />);

    expect(await screen.findByRole('textbox', { name: 'Notes' })).toHaveValue('left open');
    expect(screen.getByRole('button', { name: 'Unpin notes' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument();
  });

  it('truncates an oversized pulled note before writing it back', async () => {
    const oversized = 'x'.repeat(MAX_NOTE_LENGTH + 1000);
    const { updateSettings } = mockStore({ note: oversized });
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: `${oversized}!` } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(updateSettings.mock.calls[0][0].note).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('ignores typing until settings have loaded, so the stored note is not replaced', async () => {
    const { updateSettings } = mockStore({ isLoading: true });
    render(<NotesWidget />);
    const pad = await openPad();

    fireEvent.change(pad, { target: { value: 'x' } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(updateSettings).not.toHaveBeenCalled();
    expect(pad).toHaveValue('');
  });

  it('remembers that the pad was pinned', async () => {
    const { updateSettings } = mockStore();
    render(<NotesWidget />);
    await openPad();

    fireEvent.click(screen.getByRole('button', { name: 'Keep notes open' }));

    expect(updateSettings).toHaveBeenCalledWith({ notesPinned: true });
    expect(screen.getByRole('button', { name: 'Unpin notes' })).toBeInTheDocument();
  });

  it('has no close button while unpinned, because clicking away closes it', async () => {
    mockStore();
    render(<NotesWidget />);
    await openPad();

    expect(screen.queryByRole('button', { name: 'Close notes' })).not.toBeInTheDocument();
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
