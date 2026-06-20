import { createSettingsStoreMock, reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from '../stores/reminder-store';
import { useSettingsStore } from '../stores/settings-store';
import { ReminderWidget } from './ReminderWidget';

vi.mock('../stores/reminder-store', () => ({
  useReminderStore: vi.fn(),
}));

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

const HOUR_MS = 60 * 60 * 1000;

// One active upcoming reminder plus the action fns the widget destructures.
function mockReminderStore(overrides: Record<string, unknown> = {}) {
  const upcoming = reminderFactory.build({
    id: 'upcoming-1',
    text: 'Review pull request',
    category: 'productivity',
    dueDate: new Date(Date.now() + 3 * HOUR_MS).toISOString(),
  });
  vi.mocked(useReminderStore).mockReturnValue({
    upcomingReminders: [upcoming],
    overdueReminders: [],
    reminders: [upcoming],
    toggleReminder: vi.fn(),
    deleteReminder: vi.fn(),
    snoozeReminder: vi.fn(),
    setReminderPaused: vi.fn(),
    fireDueReminders: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    ...overrides,
  });
}

// The widget reads settings via selectors, so the mock must apply the selector.
function mockSettings(reminderPanelLayout: 'composed' | 'agenda', reminderPanelPinned = false) {
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ reminderPanelLayout, reminderPanelPinned })
  );
}

function expandPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Click to expand/ }));
}

describe('ReminderWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the composed layout when reminderPanelLayout is "composed"', () => {
    mockReminderStore();
    mockSettings('composed');

    render(<ReminderWidget />);
    expandPanel();

    // The "N habits · N scheduled" sub-note is unique to the composed layout.
    expect(screen.getByText(/habits ·/)).toBeInTheDocument();
    expect(screen.queryByText('On schedule')).not.toBeInTheDocument();
  });

  it('mounts the agenda layout when reminderPanelLayout is "agenda"', () => {
    mockReminderStore();
    mockSettings('agenda');

    render(<ReminderWidget />);
    expandPanel();

    // The "On schedule" sub-note is unique to the agenda layout.
    expect(screen.getByText('On schedule')).toBeInTheDocument();
    expect(screen.queryByText(/habits ·/)).not.toBeInTheDocument();
  });

  it('renders the error fallback and no panel when the store reports an error', () => {
    mockReminderStore({ error: 'Failed to read storage' });
    mockSettings('composed');

    render(<ReminderWidget />);
    fireEvent.click(screen.getByRole('button', { name: /Click to see details/ }));

    expect(screen.getByText('Failed to load reminders')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
  });

  it('collapses on an outside click when not pinned', () => {
    mockReminderStore();
    mockSettings('composed', false);

    render(<ReminderWidget />);
    expandPanel();
    expect(screen.getByText(/habits ·/)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/habits ·/)).not.toBeInTheDocument();
  });

  it('stays open on an outside click when pinned', () => {
    mockReminderStore();
    mockSettings('composed', true);

    render(<ReminderWidget />);
    // Auto-expand already opened the panel; no bell click needed.
    expect(screen.getByText(/habits ·/)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.getByText(/habits ·/)).toBeInTheDocument();
  });

  it('auto-expands the panel on mount when pinned', () => {
    mockReminderStore();
    mockSettings('composed', true);

    render(<ReminderWidget />);

    // No bell click — the panel is already open because the setting is pinned.
    expect(screen.getByText(/habits ·/)).toBeInTheDocument();
  });
});
